from django.urls import path
from . import views

urlpatterns = [
    path("download/", views.download_song, name="download_song"),
    path(
        "media/<str:file_name>", views.download_file, name="download_file"
    ),  # TODO: why is this a path? use DB instead
]
