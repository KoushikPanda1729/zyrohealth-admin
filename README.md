admin@fullhealth.com
Admin@1234

Super Admin

Email: superadmin@fullhealth.com
Password: SuperAdmin@2026
Active, role: super_admin, password confirmed matching right now on localhost:3003/localhost:3001.

 celery -A app.core.celery_app worker --loglevel=info
  uvicorn app.main:app --reload --port 8001