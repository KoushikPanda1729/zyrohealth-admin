admin@fullhealth.com
Admin@1234



 celery -A app.core.celery_app worker --loglevel=info
  uvicorn app.main:app --reload --port 8001