from django.urls import path
from . import views

urlpatterns = [
    path("csrf/", views.csrf, name="csrf"),
    path("upload-cookies/", views.upload_cookies, name="upload_cookies"),
    path("download/", views.DownloadSongAPIView.as_view()),
]
