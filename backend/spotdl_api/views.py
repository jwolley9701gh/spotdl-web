import os
import uuid
import threading
import asyncio
import importlib
import logging
import shutil

from django.http import JsonResponse
from django.conf import settings
from django.core.cache import cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.middleware.csrf import get_token
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from spotdl import Spotdl
from spotdl.types.options import DownloaderOptions
from spotdl.types.song import Song
from spotdl.types.playlist import Playlist
from spotdl.types.album import Album
from spotdl.types.artist import Artist

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from supabase import create_client

from .models import DownloadTask

# Get a logger instance
logger = logging.getLogger("spotdl_api")


@ensure_csrf_cookie
def csrf(request):
    csrf_token = get_token(request)
    return JsonResponse({"csrfToken": csrf_token})


@require_http_methods(["GET"])
def check_cookie_status(request):
    """Check if cookie file exists and is valid"""
    try:
        cookie_exists = os.path.exists(settings.COOKIE_FILE)
        return JsonResponse({"has_cookies": cookie_exists})
    except Exception as e:
        logger.error(f"Error checking cookie status: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@require_http_methods(["POST"])
def upload_cookies(request):
    """
    Upload cookies for the downloader
    """
    try:
        # Get the cookie data from request
        cookie_data = request.FILES.get("cookie_file")

        if not cookie_data:
            return JsonResponse({"error": "No cookie file provided"}, status=400)

        # Write the cookie file
        with open(settings.COOKIE_FILE, "wb+") as cookie_file:
            for chunk in cookie_data.chunks():
                cookie_file.write(chunk)

        return JsonResponse({"message": "Cookie file uploaded successfully"})

    except Exception as e:
        logger.error(f"Error uploading cookies: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


def clear_media_directory():
    """
    Clear all files in the media directory.
    """
    media_dir = settings.MEDIA_ROOT
    if os.path.exists(media_dir):
        for filename in os.listdir(media_dir):
            file_path = os.path.join(media_dir, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                else:
                    shutil.rmtree(file_path)
            except Exception as e:
                logger.error(f"Failed to delete {file_path}. Reason: {e}")


def get_song_list(url):
    auth_manager = SpotifyClientCredentials(
        client_id=settings.SPOTIFY_CLIENT_ID,
        client_secret=settings.SPOTIFY_CLIENT_SECRET,
    )
    sp = spotipy.Spotify(auth_manager=auth_manager)
    if "track" in url:
        track = sp.track(url)
        meta = {
            "song_id": track["id"],
            "name": track["name"],
        }
        return [meta]
    elif "playlist" in url:
        tracks = sp.playlist_tracks(url)
        all_meta = []
        for item in tracks["items"]:
            track = item["track"]
            meta = {
                "song_id": track["id"],
                "name": track["name"],
            }
            all_meta.append(meta)
        return all_meta
    # TODO: Add support for album and artist URLs


class DownloadSongAPIView(APIView):
    def post(self, request):
        url = request.data.get("url")
        if not url:
            return Response({"error": "URL is required"}, status=400)

        # 1) Create the DB record (only id & url)
        task_id = str(uuid.uuid4())
        DownloadTask.objects.create(id=task_id, url=url)

        channel_layer = get_channel_layer()
        group = f"download_{task_id}"

        group_songs = get_song_list(url)

        # 3) Background download job
        def download_job():
            try:
                # b) Create a fresh event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                # c) Initialize SpotifyClient & Spotdl in this thread
                from spotdl import Spotdl
                from spotdl.types.options import DownloaderOptions

                opts = {
                    "log_level": "DEBUG",
                    "cookie_file": settings.COOKIE_FILE,  # Add the cookie file path
                    "bitrate": "132k",
                    "output": os.path.join(
                        settings.MEDIA_ROOT, "{artists} - {title}.{output-ext}"
                    ),
                }

                spotdl_thread = Spotdl(
                    client_id=settings.SPOTIFY_CLIENT_ID,
                    client_secret=settings.SPOTIFY_CLIENT_SECRET,
                    loop=loop,
                    downloader_settings=DownloaderOptions(**opts),
                )

                # e) Attach ProgressHandler → WebSocket callback
                from spotdl.download.progress_handler import ProgressHandler

                def ws_callback(handler, message=""):
                    song_json = handler.song.json
                    p = int(handler.progress)
                    data = {
                        "progress": p,
                        "message": message,
                        "song": song_json,  # tag this update with the song info
                    }
                    async_to_sync(channel_layer.group_send)(
                        group,
                        {"type": "progress_update", "data": data},
                    )

                spotdl_thread.downloader.progress_handler = ProgressHandler(
                    simple_tui=True,
                    update_callback=ws_callback,
                )

                if "track" in url:
                    song = Song.from_url(url)
                    song_list = [song]
                elif "playlist" in url:
                    playlist = Playlist.from_url(url)
                    song_list = list(map(Song.from_url, playlist.urls))
                elif "album" in url:
                    album = Album.from_url(url)
                    song_list = list(map(Song.from_url, album.urls))
                elif "artist" in url:
                    artist = Artist.from_url(url)
                    song_list = list(map(Song.from_url, artist.urls))

                results = spotdl_thread.download_songs(song_list)
                file_paths = [path for (_, path) in results]

                zip_base = os.path.join(settings.MEDIA_ROOT, task_id)
                zip_path = shutil.make_archive(
                    task_id, "zip", root_dir=settings.MEDIA_ROOT
                )
                final_path = zip_path

                # g) Upload the resulting file to Supabase Storage
                supa = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
                with open(final_path, "rb") as f:
                    key = f"{task_id}/{os.path.basename(final_path)}"
                    supa.storage.from_("downloads").upload(key, f)
                    public_url = supa.storage.from_("downloads").get_public_url(key)

                # h) Persist the final download_url in your DB
                task = DownloadTask.objects.get(id=task_id)
                task.download_url = public_url
                task.save()

                spotdl_thread.downloader.progress_handler.close()
                # Clean up the local file
                if os.path.exists(final_path):
                    os.remove(final_path)
                # Clear the media directory
                clear_media_directory()
                # Send a final message to the group
                async_to_sync(channel_layer.group_send)(
                    group,
                    {"type": "download_complete", "data": {"download_url": public_url}},
                )

            except Exception:
                logger.exception("Download failed")
                err = {"status": "error", "progress": 0}
                async_to_sync(channel_layer.group_send)(
                    group, {"type": "progress_update", "data": err}
                )

        # 4) Launch the job in its own thread
        threading.Thread(target=download_job, daemon=True).start()

        return Response({"task_id": task_id, "songs": group_songs}, status=202)
