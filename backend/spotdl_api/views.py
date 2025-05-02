import os
import uuid
import threading
import asyncio
import importlib
import logging
import shutil
import tempfile
import zipfile

from django.http import HttpRequest, JsonResponse
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
from spotdl.download.progress_handler import ProgressHandler

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from supabase import create_client

from .models import DownloadTask

# Get a logger instance
logger = logging.getLogger("spotdl_api")


def get_supabase_client():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


@ensure_csrf_cookie
def csrf(request):
    csrf_token = get_token(request)
    return JsonResponse({"csrfToken": csrf_token})


@require_http_methods(["POST"])
def upload_cookies(request: HttpRequest):
    """
    Upload the user's cookie file into Supabase Storage under `cookies/cookie.txt`.
    """
    cookie_file = request.FILES.get("cookie_file")
    if not cookie_file:
        return JsonResponse({"error": "No cookie file provided"}, status=400)

    supa = get_supabase_client()
    try:
        # convert the file to bytes
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
        try:
            for chunk in cookie_file.chunks():
                tmp.write(chunk)
            tmp.flush()
            tmp_path = tmp.name
        finally:
            tmp.close()
        # overwrite any existing cookie.txt
        supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).upload(
            "cookie.txt", tmp_path, {"upsert": "true"}
        )
        return JsonResponse({"message": "Cookie file uploaded successfully"})
    except Exception as e:
        logger.error("Error uploading cookie to Supabase: %s", e, exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
    finally:
        # Clean up the temp file
        try:
            os.remove(tmp_path)
        except OSError:
            logger.error("Error deleting temp file: %s", tmp_path, exc_info=True)


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


# TODO: client & server size checking of url & cookie file
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
                supa = get_supabase_client()
                data = supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).download(
                    "cookie.txt"
                )
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
                tmp.write(data)  # data is raw bytes
                tmp.flush()
                tmp.close()
                cookie_path = tmp.name

                # b) Create a fresh event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                # c) Initialize SpotifyClient & Spotdl in this thread
                from spotdl import Spotdl
                from spotdl.types.options import DownloaderOptions

                opts = {
                    "log_level": "DEBUG",
                    "cookie_file": cookie_path,
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

                spotdl_thread.download_songs(song_list)

                loop.stop()

                # Use Python's zipfile module to only include .mp3 or .lrc files
                zip_path = os.path.join(settings.MEDIA_ROOT, f"{task_id}.zip")
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                    for root, _, files in os.walk(settings.MEDIA_ROOT):
                        for file in files:
                            if file.endswith(".mp3") or file.endswith(".lrc"):
                                file_path = os.path.join(root, file)
                                arcname = os.path.relpath(
                                    file_path, settings.MEDIA_ROOT
                                )
                                zipf.write(file_path, arcname)
                logger.info("ZIP archive created successfully at %s", zip_path)

                # g) Upload the resulting file to Supabase Storage
                supa = get_supabase_client()
                with open(zip_path, "rb") as f:
                    # check zip_path exists
                    if not os.path.exists(zip_path):
                        logger.error("Zip file does not exist: %s", zip_path)
                        raise FileNotFoundError(f"Zip file does not exist: {zip_path}")
                    key = f"{task_id}/{os.path.basename(zip_path)}"
                    supa.storage.from_("downloads").upload(key, f)
                    public_url = supa.storage.from_("downloads").get_public_url(key)
                    logger.info("Public URL: %s", public_url)

                # h) Persist the final download_url in your DB
                task = DownloadTask.objects.get(id=task_id)
                task.download_url = public_url
                task.save()

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
            finally:
                logger.info("Cleaning up...")
                # close the progress handler

                if spotdl_thread is not None:
                    logger.info("> Spotdl thread")
                    # Ensure the progress handler is closed
                    if hasattr(spotdl_thread.downloader, "progress_handler"):
                        spotdl_thread.downloader.progress_handler.close()
                    else:
                        logger.warning("Progress handler not found in downloader")
                    logger.info("DONE")

                # cleanup local files
                logger.info("> Media directory")
                clear_media_directory()
                logger.info("DONE")

                # remove temp cookie file
                logger.info("> Cookie file")
                try:
                    os.remove(cookie_path)
                except OSError:
                    logger.error("Error deleting temp cookie file: %s", cookie_path)

                # remove stored cookie file from Supabase
                try:
                    supa = get_supabase_client()
                    supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).remove(
                        ["cookie.txt"]
                    )
                except Exception as e:
                    logger.warning("Failed to delete cookie file from Supabase: %s", e)
                logger.info("DONE")

                logger.info("> Close Loop")
                try:
                    loop.close()
                except Exception:
                    logger.warning("Failed to close loop for task %s", task_id)
                # Remove it from thread-local so no stray references
                asyncio.set_event_loop(None)
                logger.info("DONE")

        # 4) Launch the job in its own thread
        threading.Thread(target=download_job, daemon=True).start()

        return Response({"task_id": task_id, "songs": group_songs}, status=202)
