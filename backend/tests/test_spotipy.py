from pprint import pprint
import unittest
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import os
from dotenv import load_dotenv

load_dotenv()

TRACK_ID = "2xqZgDhbEzNIQGEz8HdrkJ"
TRACK_NAME_KO = "운이 좋았지"


class TestSpotipyClient(unittest.TestCase):
    def setUp(self):
        # Get Spotify client ID and secret from environment variables
        client_id = os.getenv("SPOTIFY_CLIENT_ID")
        client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
        self.client_credentials = SpotifyClientCredentials(
            client_id=client_id, client_secret=client_secret
        )

    def init_client(self, language=None):
        client = spotipy.Spotify(
            client_credentials_manager=self.client_credentials,
            language=language,
        )
        return client

    def test_get_track(self):
        client = self.init_client()
        # Make an actual API call to fetch a track
        track = client.track(TRACK_ID)

        # Assertions to verify the response
        self.assertEqual(track["id"], TRACK_ID)
        # Print the returned track information
        pprint(f"Track Info: {track}")

    def test_get_track_with_language(self):
        client = self.init_client(language="ko")
        # Make an actual API call to fetch a track
        track = client.track(TRACK_ID)

        # Assertions to verify the response
        self.assertEqual(track["id"], TRACK_ID)
        self.assertEqual(track["name"], TRACK_NAME_KO)
        # Print the returned track information
        pprint(f"Track Info with Language: {track}")


if __name__ == "__main__":
    unittest.main()
