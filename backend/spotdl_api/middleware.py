import base64
from django.conf import settings
from django.http import HttpResponse


class BasicAuthMiddleware:
    EXEMPT_PATHS = ["/api/csrf/"]

    def __call__(self, request):
        # 1) let these paths through without auth
        if request.path in self.EXEMPT_PATHS:
            return self.get_response(request)

        # 2) otherwise require Basic-Auth as before
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Basic "):
            user, pwd = base64.b64decode(auth.split(" ")[1]).decode().split(":", 1)
            if user == settings.BASIC_AUTH_USER and pwd == settings.BASIC_AUTH_PASS:
                return self.get_response(request)

        resp = HttpResponse("Auth required", status=401)
        resp["WWW-Authenticate"] = 'Basic realm="Private"'
        return resp
