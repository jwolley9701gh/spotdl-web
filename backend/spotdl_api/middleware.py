import base64
from django.conf import settings
from django.http import HttpResponse


class BasicAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Basic "):
            creds = base64.b64decode(auth.split(" ")[1]).decode()
            user, pwd = creds.split(":", 1)
            if user == settings.BASIC_AUTH_USER and pwd == settings.BASIC_AUTH_PASS:
                return self.get_response(request)

        resp = HttpResponse("Authentication required", status=401)
        resp["WWW-Authenticate"] = 'Basic realm="Private"'
        return resp
