from django.urls import path
from . import views

urlpatterns = [
    path("csrf/", views.csrf, name="csrf"),
    path("download/", views.download_song, name="download_song"),
    path("upload-cookies/", views.upload_cookies, name="upload_cookies"),
]
