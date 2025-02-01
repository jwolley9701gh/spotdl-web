import os
import subprocess
import json
import shutil
from typing import Dict, Any
from django.http import HttpRequest, JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings


@csrf_exempt
def download_song(request: HttpRequest) -> JsonResponse:
    if request.method == "POST":
        try:
            # Parse the request body as JSON
            data: Dict[str, Any] = json.loads(request.body)
            url: str = data.get("url")
            generate_lrc: bool = data.get("generate_lrc", True)  # Default to True
            zip_name: str = data.get("zip_name", "out")  # Default to 'out.zip'

            if not url:
                return JsonResponse({"error": "URL is required"}, status=400)

            # Build the spotdl command
            command = ["spotdl", "download", url]
            if generate_lrc:
                command.append("--generate-lrc")

            # Call spotdl to download the track or playlist
            result = subprocess.run(
                command,
                cwd=settings.MEDIA_ROOT,  # Download files to the media directory
                capture_output=True,
                text=True,
            )

            # Check if the download was successful
            if result.returncode != 0:
                return JsonResponse(
                    {
                        "error": result.stderr,
                        "stdout": result.stdout,
                    },
                    status=500,
                )

            # Zip the entire MEDIA_ROOT directory
            zip_path = os.path.join(settings.MEDIA_ROOT, f"{zip_name}.zip")
            shutil.make_archive(
                zip_path.replace(".zip", ""), "zip", settings.MEDIA_ROOT
            )

            return JsonResponse(
                {
                    "message": "Download and zip completed successfully",
                    "file_url": f"/media/{zip_name}.zip",
                    "stdout": result.stdout,  # Include stdout in the response
                    "stderr": result.stderr,  # Include stderr in the response
                }
            )
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request method"}, status=405)


def download_file(request: HttpRequest, file_name: str) -> FileResponse:
    file_path = os.path.join(settings.MEDIA_ROOT, file_name)
    if os.path.exists(file_path):
        return FileResponse(open(file_path, "rb"), as_attachment=True)
    return JsonResponse({"error": "File not found"}, status=404)
