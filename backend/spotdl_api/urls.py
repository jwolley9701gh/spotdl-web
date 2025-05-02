from django.urls import path
from . import views

urlpatterns = [
    path("csrf/", views.csrf, name="csrf"),
    path("upload-cookies/", views.upload_cookies, name="upload_cookies"),
    path("cookie-status/", views.check_cookie_status, name="cookie_status"),
    path("download/", views.DownloadSongAPIView.as_view()),
]
