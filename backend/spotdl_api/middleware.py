import base64
from django.conf import settings
from django.http import HttpResponse


class BasicAuthMiddleware:
    EXEMPT_PATHS = {
        "/api/csrf/",  # allow fetching the CSRF token
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1) If the path is exempt, just continue
        if request.path in self.EXEMPT_PATHS:
            return self.get_response(request)

        # 2) Otherwise require Basic-Auth
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Basic "):
            user, pwd = base64.b64decode(auth.split(" ", 1)[1]).decode().split(":", 1)
            if user == settings.BASIC_AUTH_USER and pwd == settings.BASIC_AUTH_PASS:
                return self.get_response(request)

        # 3) No valid credentials → challenge
        resp = HttpResponse("Authentication required", status=401)
        resp["WWW-Authenticate"] = 'Basic realm="Private"'
        return resp
