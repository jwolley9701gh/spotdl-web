import os
from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
import spotdl
from django.conf import settings
import zipfile
import os


@csrf_exempt
def download_song(request):
    if request.method == "POST":
        url = request.POST.get("url")
        if not url:
            return JsonResponse({"error": "URL is required"}, status=400)

        try:
            if "playlist" in url:
                # Download the playlist
                spotdl.download([url])
                playlist_name = url.split("/")[-1]  # Extract playlist name from URL
                playlist_folder = os.path.join(settings.MEDIA_ROOT, playlist_name)

                # Zip the playlist folder
                zip_path = os.path.join(settings.MEDIA_ROOT, f"{playlist_name}.zip")
                with zipfile.ZipFile(zip_path, "w") as zipf:
                    for root, dirs, files in os.walk(playlist_folder):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, playlist_folder)
                            zipf.write(file_path, arcname)

                # Clean up the playlist folder
                for root, dirs, files in os.walk(playlist_folder, topdown=False):
                    for name in files:
                        os.remove(os.path.join(root, name))
                    for name in dirs:
                        os.rmdir(os.path.join(root, name))
                os.rmdir(playlist_folder)

                return JsonResponse(
                    {
                        "message": "Playlist downloaded and zipped successfully",
                        "file_url": f"/media/{playlist_name}.zip",
                    }
                )
            else:
                # Download a single song
                spotdl.download([url])
                song_name = url.split("/")[-1]  # Extract song name from URL
                return JsonResponse(
                    {
                        "message": "Song downloaded successfully",
                        "file_url": f"/media/{song_name}.mp3",
                    }
                )
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request method"}, status=405)
