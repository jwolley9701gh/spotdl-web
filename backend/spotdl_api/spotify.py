from spotdl import SpotifyClient
import gc


class CustomSpotifyClient(SpotifyClient):
    @classmethod
    def init(
        cls,
        client_id=None,
        client_secret=None,
        user_auth=False,
        no_cache=True,
        headless=False,
        max_retries=3,
        use_cache_file=False,
        auth_token=None,
        cache_path=None,
        language=None,  # Add language parameter
    ):
        cls.destroy_instance()  # Destroy any existing instance

        # Call the SpotifyClient.init method directly
        instance = SpotifyClient.init(
            client_id=client_id,
            client_secret=client_secret,
            user_auth=user_auth,
            no_cache=no_cache,
            headless=headless,
            max_retries=max_retries,
            use_cache_file=use_cache_file,
            auth_token=auth_token,
            cache_path=cache_path,
        )

        # Set the language if provided
        if language:
            instance.language = language
            SpotifyClient.language = language

        # Store the instance in the class
        cls._instance = instance
        return instance

    @classmethod
    def destroy_instance(cls):
        """
        Destroy the singleton instance of the Spotify client.
        """
        if hasattr(cls, "_instance") and cls._instance is not None:
            del SpotifyClient._instance
            del cls._instance
            SpotifyClient._instance = None
            cls._instance = None
            # garbage collection
            gc.collect()
