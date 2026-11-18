"""Inicia o auth-service:  python run.py   (usa AUTH_PORT do .env)"""
import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=settings.port, log_level="warning")
