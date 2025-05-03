import json
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
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.middleware.csrf import get_token
from django.db.utils import IntegrityError
from rest_framework.views import APIView
from rest_framework.response import Response

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from supabase import create_client
from spotdl import SpotifyClient, Downloader
from spotdl.types.options import DownloaderOptions
from spotdl.types.song import Song
from spotdl.types.playlist import Playlist
from spotdl.types.album import Album
from spotdl.types.artist import Artist
from spotdl.download.progress_handler import ProgressHandler, SongTracker

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from .models import DownloadSong, DownloadTask
from .crypto import decrypt_bytes, encrypt_bytes

logger = logging.getLogger("spotdl_api")
logging.getLogger("spotdl").setLevel(logging.DEBUG)

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


def cleanup_spotdl_thread(downloader: Downloader):
    """Close SpotDL's progress handler if present."""
    if not downloader:
        return
    handler = downloader.progress_handler
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

    # encrypt and write to temp file
    data = b"".join(chunk for chunk in file_obj.chunks())
    ciphertext = encrypt_bytes(data)

    enc_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".enc")
    try:
        enc_tmp.write(ciphertext)
        enc_tmp.flush()
        enc_path = enc_tmp.name
    finally:
        enc_tmp.close()
    try:
        supa = get_supabase_client()
        supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).upload(
            "cookie.txt", enc_path, {"upsert": "true"}
        )
        return JsonResponse({"message": "Cookie file uploaded successfully"})
    except Exception as e:
        logger.error("Error uploading cookie to Supabase: %s", e, exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
    finally:
        # always clean up the temp file
        cleanup_local_cookie(enc_path)


# ─── Download Status Endpoint ────────────────────────────────────────────────────


@require_http_methods(["GET"])
def download_status(request, task_id):
    # get all songs for this task
    song_objs = DownloadSong.objects.filter(task_id=task_id)
    task_obj = get_object_or_404(DownloadTask, id=task_id)
    return JsonResponse(
        {
            "download_urls": task_obj.download_urls,
            "songs": [
                {
                    "id": song.sid,
                    "name": song.name,
                    "progress": song.progress,
                    "message": song.message,
                }
                for song in song_objs
            ],
        }
    )


# ─── Download Song Endpoint ──────────────────────────────────────────────────────


class DownloadSongAPIView(APIView):
    # TODO: client & server size checking of url & cookie file
    def get_song_list(self, url):
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

    def post(self, request):
        url = request.data.get("url")
        if not url:
            return Response({"error": "URL is required"}, status=400)

        # 1) Create DB record
        task_id = str(uuid.uuid4())
        DownloadTask.objects.create(id=task_id, url=url)

        # get song metadata for frontend
        group_songs = self.get_song_list(url)
        # create DownloadSong records
        for song in group_songs:
            try:
                DownloadSong.objects.create(
                    sid=song["song_id"],
                    task_id=task_id,
                    name=song["name"],
                    progress=0,
                    message="",
                )
            except IntegrityError:
                # if the song already exists, just update the task_id and initialize progress
                DownloadSong.objects.filter(sid=song["song_id"]).update(
                    task_id=task_id, progress=0, message=""
                )

        # 2) Background job
        def download_job():
            cookie_path = None
            loop = None
            spotdl = None
            try:
                # a) Download cookie into temp file
                supa = get_supabase_client()
                enc_data = supa.storage.from_(settings.SUPABASE_COOKIE_BUCKET).download(
                    "cookie.txt"
                )
                data = decrypt_bytes(enc_data)

                plaintext = data.decode(errors="ignore")  # assume UTF-8
                lines = plaintext.splitlines()
                logger.debug(
                    "Decrypted cookies.txt (first line):\n%s", "\n".join(lines[:1])
                )

                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
                tmp.write(data)
                tmp.flush()
                tmp.close()
                cookie_path = tmp.name
                logger.info("Downloaded temp cookie file to %s", cookie_path)

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
                    "yt_dlp_args": f"--no-quiet --verbose",
                    "simple_tui": True,
                }

                try:
                    # Initialize spotify client
                    SpotifyClient.init(
                        client_id=settings.SPOTIFY_CLIENT_ID,
                        client_secret=settings.SPOTIFY_CLIENT_SECRET,
                    )

                except Exception as e:
                    logger.warning("SpotifyClient not re-initialised: %s", e)

                # d) Attach progress handler
                def on_progress(handler: SongTracker, message=""):
                    if handler.song:
                        song_id = handler.song.json["song_id"]
                        # Update progress in DB
                        try:
                            DownloadSong.objects.filter(
                                sid=song_id, task_id=task_id
                            ).update(
                                progress=handler.progress,
                                message=message,
                            )
                        except Exception:
                            logger.exception(
                                "Failed to update progress for song %s", song_id
                            )

                # Initialize downloader
                downloader = Downloader(
                    settings=DownloaderOptions(**opts),
                    loop=loop,
                )

                downloader.progress_handler = ProgressHandler(
                    simple_tui=True, update_callback=on_progress
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
                downloader.download_multiple_songs(song_list)

                loop.stop()

                # g) Gather all downloaded media files
                all_files = []
                for root, _, files in os.walk(settings.MEDIA_ROOT):
                    for fn in files:
                        if fn.endswith((".mp3", ".lrc")):
                            all_files.append(os.path.join(root, fn))

                # h) Split into batches <= 50 MiB
                MAX_SIZE = 50 * 1024 * 1024
                batches = []
                current, cursize = [], 0
                for fpath in all_files:
                    fsz = os.path.getsize(fpath)
                    # if single file > MAX, put it alone
                    if fsz > MAX_SIZE:
                        if current:
                            batches.append(current)
                            current, cursize = [], 0
                        batches.append([fpath])
                        continue
                    # if adding would overflow, start new batch
                    if cursize + fsz > MAX_SIZE:
                        batches.append(current)
                        current, cursize = [fpath], fsz
                    else:
                        current.append(fpath)
                        cursize += fsz
                if current:
                    batches.append(current)

                # i) Zip & upload each batch, collect public URLs
                supa = get_supabase_client()
                public_urls = []
                for idx, batch in enumerate(batches, start=1):
                    zip_name = (
                        f"{task_id}_{idx}.zip" if len(batches) > 1 else f"{task_id}.zip"
                    )
                    zip_path = os.path.join(settings.MEDIA_ROOT, zip_name)
                    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                        for full in batch:
                            arc = os.path.relpath(full, settings.MEDIA_ROOT)
                            zipf.write(full, arc)
                    logger.info("Created ZIP batch %d: %s", idx, zip_path)

                    # upload and get URL
                    key = f"{task_id}/{zip_name}"
                    with open(zip_path, "rb") as f:
                        supa.storage.from_("downloads").upload(key, f)
                    pu = supa.storage.from_("downloads").get_public_url(key)
                    if pu.endswith("?"):
                        pu = pu[:-1]
                    public_urls.append(pu)

                # j) Save the first URL or JSON‐encode the list if you need
                url_dict = {k: v for k, v in enumerate(public_urls)}
                DownloadTask.objects.filter(id=task_id).update(
                    download_urls=json.dumps(url_dict)
                )
                logger.info(f"Upload complete, download URLs: {url_dict}")

            except Exception:
                logger.exception("Download job failed")
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
