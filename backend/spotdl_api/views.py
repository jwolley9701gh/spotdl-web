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

nest_asyncio.apply()


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
    user_auth=DEFAULT_CONFIG["user_auth"],
    cache_path=DEFAULT_CONFIG["cache_path"],
    no_cache=True,
    headless=DEFAULT_CONFIG["headless"],
    downloader_settings=downloader_settings,
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


async def download_song(request):
    try:
        # Parse JSON data from the request body
        data = json.loads(request.body)
        url = data.get("url")  # Extract the URL from the JSON data
    except json.JSONDecodeError:
        logger.error("Invalid JSON data in request")
        return JsonResponse({"error": "Invalid JSON data"}, status=400)

    logger.debug(f"Received request to download song with URL: {url}")

    if not url:
        logger.error("No URL provided in the request")
        return JsonResponse({"error": "URL is required"}, status=400)

    try:
        logger.info(f"Attempting to download song from URL: {url}")

        # Create a Song object from the URL
        song = Song.from_url(url)

        # Call the asynchronous download_song method directly
        downloader = spotdl.downloader
        result = downloader.download_song(song)
        logger.info(f"Song downloaded successfully: {result}")

        # Convert the Song object to a dictionary using the `json` property
        song_dict = result[0].json if result[0] else None
        file_path = str(result[1]) if result[1] else None

        # Clear the media directory before moving the new file
        clear_media_directory()

        # Move the file to the media directory
        if file_path:
            file_name = os.path.basename(file_path)
            media_file_path = os.path.join(settings.MEDIA_ROOT, file_name)
            os.rename(file_path, media_file_path)

            # Generate the download URL
            download_url = f"{settings.MEDIA_URL}{file_name}"
        else:
            download_url = None

        return JsonResponse(
            {
                "message": "Song downloaded successfully",
                "song": song_dict,
                "download_url": download_url,
            }
        )
    except Exception as e:
        logger.error(f"Error downloading song: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)
