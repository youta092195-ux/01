from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from .config import Settings


logger = logging.getLogger("aimus.mailer")


def send_password_reset(
    settings: Settings,
    email: str,
    login_id: str,
    reset_url: str,
) -> bool:
    if not settings.smtp_host or not settings.smtp_from:
        logger.warning("Password reset URL for %s: %s", email, reset_url)
        return False

    message = EmailMessage()
    message["Subject"] = "AI×MUS パスワード再設定"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "パスワード再設定のリクエストを受け付けました。\n\n"
        f"ログインID: {login_id}\n\n"
        f"30分以内に次のURLを開いてください。\n{reset_url}\n\n"
        "心当たりがない場合は、このメールを破棄してください。"
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
    return True
