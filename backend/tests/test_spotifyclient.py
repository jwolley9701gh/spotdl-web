from pprint import pprint
import unittest
from spotdl import SpotifyClient
from spotdl.utils.spotify import SpotifyError
from spotdl.types.song import Song
import os
from dotenv import load_dotenv
from spotipy import Spotify
from spotdl_api.spotify import CustomSpotifyClient

load_dotenv()

TRACK_ID = "2xqZgDhbEzNIQGEz8HdrkJ"
TRACK_URL = "https://open.spotify.com/track/2xqZgDhbEzNIQGEz8HdrkJ"
TRACK_NAME_KO = "운이 좋았지"
TRACK_NAME = "I got lucky"


class TestSpotifyClient(unittest.TestCase):
    def setUp(self):
        # Get Spotify client ID and secret from environment variables
        self.client_id = os.getenv("SPOTIFY_CLIENT_ID")
        self.client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    def test_reinit_twice(self):
        # Initialize CustomSpotifyClient for the first time

        client = CustomSpotifyClient.init(
            client_id=self.client_id, client_secret=self.client_secret
        )
        self.assertIsInstance(client, Spotify, "client1 is not a Spotify instance")

        # Reinitialize CustomSpotifyClient
        CustomSpotifyClient.init(
            client_id=self.client_id, client_secret=self.client_secret
        )

    def test_get_track_with_language(self):
        # Initialize CustomSpotifyClient
        CustomSpotifyClient.init(
            client_id=self.client_id, client_secret=self.client_secret
        )

        song = Song.from_url(TRACK_URL)

        # Assertions to verify the response
        self.assertEqual(song.song_id, TRACK_ID)
        self.assertEqual(song.name, TRACK_NAME)

        del SpotifyClient._instance

        # check if SpotifyClient._instance is None
        self.assertIsNone(
            SpotifyClient._instance, "SpotifyClient._instance is not None"
        )

        CustomSpotifyClient.init(
            client_id=self.client_id, client_secret=self.client_secret, language="ko"
        )
        print(SpotifyClient()._instance.language)

        # check language of SpotifyClient
        self.assertEqual(
            SpotifyClient()._instance.language, "ko", "Language not set to 'ko'"
        )
        print(
            f"Language set to {SpotifyClient()._instance.language} for existing instance."
        )
        client = SpotifyClient()
        song = client.track(TRACK_URL)
        pprint(f"Track Info: {song}")

        # Assertions to verify the response
        self.assertEqual(song.song_id, TRACK_ID)
        self.assertEqual(song.name, TRACK_NAME_KO)


if __name__ == "__main__":
    unittest.main()
