import uuid
from django.db import models


class DownloadTask(models.Model):
    """
    Stores final download metadata only. Status and progress are handled in-memory and via WebSockets.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    url = models.URLField(help_text="The Spotify URL requested by the user")
    created = models.DateTimeField(
        auto_now_add=True, help_text="Timestamp when the download task was created"
    )
    download_url = models.URLField(
        null=True,
        blank=True,
        help_text="Public URL to the final ZIP stored in Supabase Storage",
    )

    def __str__(self):
        return f"Task {self.id} for {self.url}"
