from django.urls import re_path
from .consumers import ProgressConsumer

websocket_urlpatterns = [
    re_path(r"ws/download/(?P<task_id>[^/]+)/$", ProgressConsumer.as_asgi()),
]
