from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    data_dir: Path
    allowed_origins: list[str]
    max_upload_bytes: int
    session_days: int
    secure_cookies: bool
    public_base_url: str
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from: str | None
    smtp_use_tls: bool
    admin_login_ids: list[str]
    bootstrap_admin_password_hash: str | None
    export_user_registry: bool

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "forge.db"


def load_settings() -> Settings:
    data_dir = Path(os.getenv("FORGE_DATA_DIR", "./data")).resolve()
    public_base_url = os.getenv("FORGE_PUBLIC_BASE_URL", "http://localhost:8001").rstrip("/")
    configured_session_days = int(os.getenv("FORGE_SESSION_DAYS", "30"))
    session_days = min(configured_session_days, 30) if public_base_url.startswith("https://") else configured_session_days
    origins = [
        value.strip()
        for value in os.getenv(
            "FORGE_ALLOWED_ORIGINS",
            "http://localhost:8000,http://127.0.0.1:8000",
        ).split(",")
        if value.strip()
    ]
    settings = Settings(
        host=os.getenv("FORGE_HOST", "0.0.0.0"),
        port=int(os.getenv("FORGE_PORT") or os.getenv("PORT", "8001")),
        data_dir=data_dir,
        allowed_origins=origins,
        max_upload_bytes=int(os.getenv("FORGE_MAX_UPLOAD_MB", "300")) * 1024 * 1024,
        session_days=session_days,
        secure_cookies=os.getenv("FORGE_SECURE_COOKIES", "false").lower() == "true",
        public_base_url=public_base_url,
        smtp_host=os.getenv("FORGE_SMTP_HOST"),
        smtp_port=int(os.getenv("FORGE_SMTP_PORT", "587")),
        smtp_username=os.getenv("FORGE_SMTP_USERNAME"),
        smtp_password=os.getenv("FORGE_SMTP_PASSWORD"),
        smtp_from=os.getenv("FORGE_SMTP_FROM"),
        smtp_use_tls=os.getenv("FORGE_SMTP_USE_TLS", "true").lower() == "true",
        admin_login_ids=[
            value.strip().lower()
            for value in os.getenv("FORGE_ADMIN_LOGIN_IDS", "AI123").split(",")
            if value.strip()
        ],
        bootstrap_admin_password_hash=os.getenv("FORGE_BOOTSTRAP_ADMIN_PASSWORD_HASH") or None,
        export_user_registry=os.getenv("FORGE_EXPORT_USER_REGISTRY", "false").lower() == "true",
    )
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings
