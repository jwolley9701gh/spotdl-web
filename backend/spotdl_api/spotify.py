from spotdl import SpotifyClient


class CustomSpotifyClient(SpotifyClient):
    @classmethod
    def init(
        cls,
        client_id=None,
        client_secret=None,
        user_auth=False,
        no_cache=False,
        headless=False,
        max_retries=3,
        use_cache_file=False,
        auth_token=None,
        cache_path=None,
        language=None,  # Add language parameter
    ):
        # Check if an instance already exists
        if hasattr(cls, "_instance") and cls._instance is not None:
            return cls._instance

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

        # Store the instance in the class
        cls._instance = instance
        return instance
