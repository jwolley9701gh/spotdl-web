#!/bin/bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
gunicorn backend.asgi:application -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT