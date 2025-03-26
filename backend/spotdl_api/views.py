import logging
import json
import shutil
from django.http import JsonResponse
from spotdl import Spotdl
from django.conf import settings
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token
import asyncio
from spotdl.types.song import Song  # Import the Song class
import nest_asyncio  # Import nest_asyncio
import os
from spotdl.types.options import DownloaderOptions
from spotdl.utils.config import DEFAULT_CONFIG, DOWNLOADER_OPTIONS

# Get a logger instance
logger = logging.getLogger("spotdl_api")

# nest_asyncio.apply()
# Initialize event loop
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# downloader_settings = {"log_level": "DEBUG"}

downloader_settings = DOWNLOADER_OPTIONS.copy()
downloader_settings["log_level"] = "DEBUG"

# Initialize SpotDL
# spotdl = Spotdl(
#     # client_id=settings.SPOTIFY_CLIENT_ID,
#     # client_secret=settings.SPOTIFY_CLIENT_SECRET,
#     client_id=DEFAULT_CONFIG["client_id"],
#     client_secret=DEFAULT_CONFIG["client_secret"],
#     loop=asyncio.get_event_loop(),
#     downloader_settings=DownloaderOptions(**downloader_settings),
# )

spotdl = Spotdl(
    client_id=DEFAULT_CONFIG["client_id"],
    client_secret=DEFAULT_CONFIG["client_secret"],
    downloader_settings=downloader_settings,
    loop=asyncio.get_event_loop(),
)


@ensure_csrf_cookie
def csrf(request):
    csrf_token = get_token(request)
    return JsonResponse({"csrfToken": csrf_token})


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
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                logger.error(f"Failed to delete {file_path}. Reason: {e}")


def download_song(request):  # Removed async since we're handling loop differently
    try:
        data = json.loads(request.body)
        url = data.get("url")
    except json.JSONDecodeError:
        logger.error("Invalid JSON data in request")
        return JsonResponse({"error": "Invalid JSON data"}, status=400)

    logger.debug(f"Received request to download song with URL: {url}")

    if not url:
        logger.error("No URL provided in the request")
        return JsonResponse({"error": "URL is required"}, status=400)

    try:
        logger.info(f"Attempting to download song from URL: {url}")

        # Get song info first
        song = Song.from_url(url)
        song_dict = song.json if song else None

        try:
            # Run the download in the event loop
            result = loop.run_until_complete(loop.create_task(spotdl.download(song)))

            if result and result[1]:
                file_path = str(result[1])

                # Clear the media directory before moving the new file
                clear_media_directory()

                # Move the file to the media directory
                file_name = os.path.basename(file_path)
                media_file_path = os.path.join(settings.MEDIA_ROOT, file_name)
                os.rename(file_path, media_file_path)

                download_url = f"{settings.MEDIA_URL}{file_name}"

                logger.info(f"Song downloaded successfully: {result}")
                return JsonResponse(
                    {
                        "message": "Song downloaded successfully",
                        "song": song_dict,
                        "download_url": download_url,
                    }
                )

            logger.error("Download failed - no file path returned")
            return JsonResponse(
                {
                    "error": "Failed to download the song",
                    "song": song_dict,
                    "details": "No file path was returned from the download process",
                },
                status=503,
            )

        except Exception as download_error:
            logger.error(f"Download error: {str(download_error)}", exc_info=True)
            return JsonResponse(
                {
                    "error": "Download failed",
                    "song": song_dict,
                    "details": str(download_error),
                },
                status=503,
            )

    except Exception as e:
        logger.error(f"Error processing song: {str(e)}", exc_info=True)
        return JsonResponse(
            {"error": "Failed to process the song", "details": str(e)}, status=500
        )
