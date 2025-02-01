from django.shortcuts import render

# Create your views here.
import os
from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
import spotdl
from django.conf import settings


@csrf_exempt
def download_song(request):
    if request.method == "POST":
        spotify_url = request.POST.get("url")
        if not spotify_url:
            return JsonResponse({"error": "URL is required"}, status=400)

        try:
            # Download the song using spotDL
            spotdl.download([spotify_url])
            song_name = spotify_url.split("/")[-1]  # Extract song name from URL
            file_path = os.path.join(settings.MEDIA_ROOT, f"{song_name}.mp3")
            return JsonResponse(
                {
                    "message": "Song downloaded successfully",
                    "file_url": f"/media/{song_name}.mp3",
                }
            )
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request method"}, status=405)


def download_file(request, file_name):
    file_path = os.path.join(settings.MEDIA_ROOT, file_name)
    if os.path.exists(file_path):
        return FileResponse(open(file_path, "rb"), as_attachment=True)
    return JsonResponse({"error": "File not found"}, status=404)
