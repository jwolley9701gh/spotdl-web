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
from django.views.decorators.http import require_http_methods

# Get a logger instance
logger = logging.getLogger("spotdl_api")

nest_asyncio.apply()

downloader_settings = {
    "log_level": "DEBUG",
    "cookie_file": settings.COOKIE_FILE,  # Add the cookie file path
}

# Initialize SpotDL
spotdl = Spotdl(
    client_id=settings.SPOTIFY_CLIENT_ID,
    client_secret=settings.SPOTIFY_CLIENT_SECRET,
    loop=asyncio.get_event_loop(),
    downloader_settings=DownloaderOptions(**downloader_settings),
)


@ensure_csrf_cookie
def csrf(request):
    csrf_token = get_token(request)
    return JsonResponse({"csrfToken": csrf_token})


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
