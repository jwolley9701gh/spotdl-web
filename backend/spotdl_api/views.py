import os
import threading
import uuid
import asyncio
import logging
import shutil
import tempfile
import zipfile

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.core.cache import cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.middleware.csrf import get_token
from rest_framework.views import APIView
from rest_framework.response import Response

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from supabase import create_client
from spotdl import Spotdl
from spotdl.types.options import DownloaderOptions
from spotdl.types.song import Song
from spotdl.types.playlist import Playlist
from spotdl.types.album import Album
from spotdl.types.artist import Artist
from spotdl.download.progress_handler import ProgressHandler

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from .models import DownloadTask

logger = logging.getLogger("spotdl_api")
logging.getLogger("spotdl").setLevel(logging.DEBUG)
logging.getLogger("yt_dlp").setLevel(logging.DEBUG)

# ─── Helpers ────────────────────────────────────────────────────────────────────


def get_supabase_client():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def clear_media_directory():
    """Delete everything under MEDIA_ROOT."""
    media_dir = settings.MEDIA_ROOT
    if os.path.isdir(media_dir):
        for name in os.listdir(media_dir):
            path = os.path.join(media_dir, name)
            try:
                if os.path.isfile(path) or os.path.islink(path):
                    os.unlink(path)
                else:
                    shutil.rmtree(path)
            except Exception as e:
                logger.warning("Failed to delete %s: %s", path, e)


def cleanup_spotdl_thread(spotdl_thread: Spotdl):
    """Close SpotDL's progress handler if present."""
    if not spotdl_thread:
        return
    handler = getattr(spotdl_thread.downloader, "progress_handler", None)
    if handler:
        try:
            handler.close()
        except Exception as e:
            logger.warning("Error closing progress handler: %s", e)


def cleanup_local_cookie(cookie_path: str):
    """Remove the temp cookie file from disk."""
    if not cookie_path:
        return
    try:
        os.remove(cookie_path)
    except Exception as e:
        logger.warning("Error deleting temp cookie file %s: %s", cookie_path, e)


def cleanup_remote_cookie():
    """Delete the stored cookie.txt from Supabase Storage."""
    try:
        supa = get_supabase_client()
        supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).remove(["cookie.txt"])
    except Exception as e:
        logger.warning("Failed to delete cookie from Supabase: %s", e)


def cleanup_event_loop(loop: asyncio.AbstractEventLoop):
    """Close and unset the event loop for this thread."""
    if not loop:
        return
    try:
        loop.close()
    except Exception as e:
        logger.warning("Failed to close event loop: %s", e)
    finally:
        try:
            asyncio.set_event_loop(None)
        except Exception:
            pass


# ─── CSRF & Cookie Upload Endpoints ─────────────────────────────────────────────


@ensure_csrf_cookie
def csrf(request):
    token = get_token(request)
    return JsonResponse({"csrfToken": token})


@ensure_csrf_cookie
@require_http_methods(["POST"])
def upload_cookies(request: HttpRequest):
    file_obj = request.FILES.get("cookie_file")
    if not file_obj:
        return JsonResponse({"error": "No cookie file provided"}, status=400)

    # write to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
    try:
        for chunk in file_obj.chunks():
            tmp.write(chunk)
        tmp.flush()
        tmp_path = tmp.name
    finally:
        tmp.close()

    try:
        supa = get_supabase_client()
        supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).upload(
            "cookie.txt", tmp_path, {"upsert": "true"}
        )
        return JsonResponse({"message": "Cookie file uploaded successfully"})
    except Exception as e:
        logger.error("Error uploading cookie to Supabase: %s", e, exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
    finally:
        # always clean up the temp file
        cleanup_local_cookie(tmp_path)


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

        # 1) Create DB record
        task_id = str(uuid.uuid4())
        DownloadTask.objects.create(id=task_id, url=url)

        # prepare WebSocket group
        channel_layer = get_channel_layer()
        group = f"download_{task_id}"

        # get song metadata for frontend
        group_songs = get_song_list(url)

        # 2) Background job
        def download_job():
            cookie_path = None
            loop = None
            spotdl = None
            try:
                # a) Download cookie into temp file
                supa = get_supabase_client()
                data = supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).download(
                    "cookie.txt"
                )
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
                tmp.write(data)
                tmp.flush()
                tmp.close()
                cookie_path = tmp.name

                # b) New event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                # c) Initialize Spotdl in this thread
                ffmpeg_path = settings.FFMPEG_PATH if settings.FFMPEG_PATH else "ffmpeg"
                opts = {
                    "log_level": "DEBUG",
                    "cookie_file": cookie_path,
                    "bitrate": "132k",
                    "generate_lrc": True,
                    "ffmpeg": ffmpeg_path,
                    "output": os.path.join(
                        settings.MEDIA_ROOT, "{artists} - {title}.{output-ext}"
                    ),
                    "yt_dlp_args": "--no-quiet --verbose",
                }

                spotdl = Spotdl(
                    client_id=settings.SPOTIFY_CLIENT_ID,
                    client_secret=settings.SPOTIFY_CLIENT_SECRET,
                    loop=loop,
                    downloader_settings=DownloaderOptions(**opts),
                )

                # d) Attach progress handler
                def ws_callback(handler, message=""):
                    data = {
                        "progress": int(handler.progress),
                        "message": message,
                        "song": handler.song.json,
                    }
                    async_to_sync(channel_layer.group_send)(
                        group, {"type": "progress_update", "data": data}
                    )

                spotdl.downloader.progress_handler = ProgressHandler(
                    simple_tui=True, update_callback=ws_callback
                )

                # e) Build Song list
                if "track" in url:
                    song_list = [Song.from_url(url)]
                elif "playlist" in url:
                    pl = Playlist.from_url(url)
                    song_list = [Song.from_url(u) for u in pl.urls]
                elif "album" in url:
                    al = Album.from_url(url)
                    song_list = [Song.from_url(u) for u in al.urls]
                elif "artist" in url:
                    ar = Artist.from_url(url)
                    song_list = [Song.from_url(u) for u in ar.urls]
                else:
                    raise ValueError(f"Unsupported URL type: {url}")

                # f) Perform the download (blocking)
                spotdl.download_songs(song_list)

                loop.stop()

                # g) Zip up into MEDIA_ROOT/<task_id>.zip
                zip_path = os.path.join(settings.MEDIA_ROOT, f"{task_id}.zip")
                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                    for root, _, files in os.walk(settings.MEDIA_ROOT):
                        for fn in files:
                            if fn.endswith((".mp3", ".lrc")):
                                full = os.path.join(root, fn)
                                arc = os.path.relpath(full, settings.MEDIA_ROOT)
                                zipf.write(full, arc)
                logger.info("Created ZIP: %s", zip_path)

                # h) Upload ZIP to Supabase
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

                # i) Save in DB
                DownloadTask.objects.filter(id=task_id).update(download_url=public_url)

                # j) Notify frontend of completion
                async_to_sync(channel_layer.group_send)(
                    group,
                    {
                        "type": "download_complete",
                        "data": {"download_url": public_url},
                    },
                )

            except Exception:
                logger.exception("Download job failed")
                async_to_sync(channel_layer.group_send)(
                    group,
                    {
                        "type": "progress_update",
                        "data": {"message": "error", "progress": 0},
                    },
                )
            finally:
                logger.info("Running cleanup for task %s", task_id)
                cleanup_spotdl_thread(spotdl)
                clear_media_directory()
                cleanup_local_cookie(cookie_path)
                cleanup_remote_cookie()
                cleanup_event_loop(loop)
                logger.info("Cleanup done for task %s", task_id)

        # 3) Fire & forget the background job
        threading.Thread(target=download_job, daemon=True).start()

        return Response({"task_id": task_id, "songs": group_songs}, status=202)
