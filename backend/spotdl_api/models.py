import uuid
from django.db import models


class DownloadTask(models.Model):
    """
    Represents one user-initiated download job.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    created = models.DateTimeField(auto_now_add=True)
    url = models.URLField(
        help_text="Original Spotify URL to download (track, album, or playlist)"
    )
    download_urls = models.JSONField(
        null=True,
        blank=True,
        help_text="List of Supabase-hosted ZIP URLs when the job completes",
    )

    def __str__(self):
        return f"Task {self.id} ({self.url})"


class DownloadSong(models.Model):
    """
    Tracks per-song progress/messages within a DownloadTask.
    """

    # Use the Spotify track ID (or any unique string) as the PK
    sid = models.CharField(max_length=128, null=True, help_text="Spotify track ID")
    task = models.ForeignKey(
        DownloadTask,
        related_name="songs",
        on_delete=models.CASCADE,
        help_text="The download job this song belongs to",
    )
    name = models.CharField(max_length=255, help_text="Song title/artist for display")
    progress = models.IntegerField(
        default=0, help_text="Download progress for this song (0-100%)"
    )
    message = models.CharField(
        max_length=255,
        blank=True,
        help_text="Last status message (e.g. 'downloading', 'merged', 'error…')",
    )
    updated = models.DateTimeField(
        auto_now=True, help_text="When this song's record was last updated"
    )

    # (sid, task) is the unique constraint
    class Meta:
        unique_together = ("sid", "task")
        # index by unique constraint
        indexes = [
            models.Index(fields=["sid", "task"]),
        ]

    def __str__(self):
        return f"{self.name} [{self.progress}%]"
