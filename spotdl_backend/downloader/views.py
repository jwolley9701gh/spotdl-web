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
            # Empty the MEDIA_ROOT directory
            for item in os.listdir(settings.MEDIA_ROOT):
                item_path = os.path.join(settings.MEDIA_ROOT, item)
                if os.path.isfile(item_path) or os.path.islink(item_path):
                    os.unlink(item_path)  # Delete files and links
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)  # Delete directories

            # Parse the request body as JSON
            data: Dict[str, Any] = json.loads(request.body)
            url: str = data.get("url")
            generate_lrc: bool = data.get("generate_lrc", True)  # Default to True
            dir_name: str = data.get("dir_name", "out")  # Default to 'out'

            if not url:
                return JsonResponse({"error": "URL is required"}, status=400)

            # Create the directory inside MEDIA_ROOT
            dir_path = os.path.join(settings.MEDIA_ROOT, dir_name)

            # If the directory already exists, delete it
            if os.path.exists(dir_path):
                shutil.rmtree(dir_path)

            # Create the directory
            os.makedirs(dir_path, exist_ok=True)

            # Build the spotdl command
            command = ["spotdl", "download", url]
            if generate_lrc:
                command.append("--generate-lrc")

            # Call spotdl to download the track or playlist into the new directory
            result = subprocess.run(
                command,
                cwd=dir_path,  # Run the command inside the new directory
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

            # Zip the contents of the directory
            zip_path = os.path.join(settings.MEDIA_ROOT, f"{dir_name}.zip")
            shutil.make_archive(zip_path.replace(".zip", ""), "zip", dir_path)

            return JsonResponse(
                {
                    "message": "Download and zip completed successfully",
                    "file_url": f"/media/{dir_name}.zip",
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
