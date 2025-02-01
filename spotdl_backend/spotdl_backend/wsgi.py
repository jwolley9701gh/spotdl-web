"""
WSGI config for spotdl_backend project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/wsgi/
"""

import os
from django.core.wsgi import get_wsgi_application
from whitenoise import WhiteNoise
from django.conf import settings  # Import settings to access BASE_DIR

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "spotdl_backend.settings")
application = get_wsgi_application()

# Use WhiteNoise to serve static files
application = WhiteNoise(
    application, root=os.path.join(settings.BASE_DIR, "staticfiles")
)
