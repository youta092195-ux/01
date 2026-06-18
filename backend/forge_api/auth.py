from __future__ import annotations

import hashlib
import hmac
import csv
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from .models import UserRegistration
from .repository import utc_now


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(expected)),
        )
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuthRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = Lock()
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    member_number TEXT UNIQUE,
                    login_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    email TEXT COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    username TEXT NOT NULL,
                    birth_date TEXT,
                    weight_kg REAL NOT NULL,
                    purpose TEXT NOT NULL,
                    notifications INTEGER NOT NULL DEFAULT 1,
                    bench_max REAL,
                    squat_max REAL,
                    deadlift_max REAL,
                    target_weight_kg REAL,
                    goal_text TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
                ON user_sessions(user_id);

                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(users)").fetchall()
            }
            additions = {
                "member_number": "TEXT",
                "email": "TEXT",
                "target_weight_kg": "REAL",
                "goal_text": "TEXT",
                "birth_date": "TEXT",
            }
            for name, column_type in additions.items():
                if name not in columns:
                    connection.execute(f"ALTER TABLE users ADD COLUMN {name} {column_type}")
            connection.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
                ON users(email COLLATE NOCASE)
                WHERE email IS NOT NULL
                """
            )
            connection.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_member_number
                ON users(member_number)
                WHERE member_number IS NOT NULL
                """
            )

    @staticmethod
    def _public_user(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        user = dict(row)
        user.pop("password_hash", None)
        user.pop("updated_at", None)
        user["notifications"] = bool(user["notifications"])
        return user

    def create_user(self, registration: UserRegistration) -> dict[str, Any]:
        now = utc_now()
        user_id = str(uuid4())
        with self._lock, self._connect() as connection:
            next_number = connection.execute(
                "SELECT COUNT(*) + 1 FROM users"
            ).fetchone()[0]
            member_number = f"AIMUS-{next_number:08d}"
            try:
                connection.execute(
                    """
                    INSERT INTO users (
                        id, member_number, login_id, email, password_hash,
                        username, birth_date, weight_kg, purpose,
                        notifications, bench_max, squat_max, deadlift_max,
                        target_weight_kg, goal_text, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        member_number,
                        registration.login_id.strip(),
                        registration.email,
                        _hash_password(registration.password),
                        registration.username.strip(),
                        registration.birth_date.isoformat(),
                        registration.weight_kg,
                        registration.purpose.value,
                        int(registration.notifications),
                        registration.bench_max,
                        registration.squat_max,
                        registration.deadlift_max,
                        registration.target_weight_kg,
                        registration.goal_text,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as error:
                message = "このIDまたはメールアドレスはすでに使用されています。"
                raise ValueError(message) from error
        user = self.get_user(user_id)
        self._append_user_registry(user)
        return user

    def _append_user_registry(self, user: dict[str, Any]) -> None:
        registry_path = self.database_path.parent / "user_registry.csv"
        registry_path.parent.mkdir(parents=True, exist_ok=True)
        headers = [
            "member_number",
            "user_id",
            "login_id",
            "email",
            "username",
            "birth_date",
            "purpose",
            "weight_kg",
            "target_weight_kg",
            "goal_text",
            "bench_max",
            "squat_max",
            "deadlift_max",
            "notifications",
            "created_at",
        ]
        write_header = not registry_path.exists() or registry_path.stat().st_size == 0
        if not write_header:
            with registry_path.open("r", newline="", encoding="utf-8-sig") as source:
                existing_rows = list(csv.DictReader(source))
            existing_headers = list(existing_rows[0].keys()) if existing_rows else []
            if existing_headers != headers:
                with registry_path.open("w", newline="", encoding="utf-8-sig") as output:
                    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
                    writer.writeheader()
                    writer.writerows(existing_rows)
        with registry_path.open("a", newline="", encoding="utf-8-sig") as output:
            writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
            if write_header:
                writer.writeheader()
            writer.writerow({**user, "user_id": user["id"]})

    def authenticate(self, login_id: str, password: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE login_id = ? COLLATE NOCASE",
                (login_id.strip(),),
            ).fetchone()
        if row is None or not _verify_password(password, row["password_hash"]):
            return None
        return self._public_user(row)

    def update_profile(
        self,
        user_id: str,
        username: str,
        birth_date: str,
    ) -> dict[str, Any]:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE users
                SET username = ?, birth_date = ?, updated_at = ?
                WHERE id = ?
                """,
                (username.strip(), birth_date, utc_now(), user_id),
            )
        return self.get_user(user_id)

    def update_login_id(
        self,
        user_id: str,
        login_id: str,
        current_password: str,
    ) -> dict[str, Any] | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            if row is None or not _verify_password(current_password, row["password_hash"]):
                return None
            try:
                connection.execute(
                    "UPDATE users SET login_id = ?, updated_at = ? WHERE id = ?",
                    (login_id.strip(), utc_now(), user_id),
                )
            except sqlite3.IntegrityError as error:
                raise ValueError("このIDはすでに使用されています。") from error
        return self.get_user(user_id)

    def update_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
    ) -> bool:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            if row is None or not _verify_password(current_password, row["password_hash"]):
                return False
            connection.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (_hash_password(new_password), utc_now(), user_id),
            )
            connection.execute(
                "DELETE FROM user_sessions WHERE user_id = ?",
                (user_id,),
            )
        return True

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        return self._public_user(row) if row else None

    def create_session(self, user_id: str, days: int) -> str:
        token = secrets.token_urlsafe(48)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=days)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (_token_hash(token), user_id, expires_at.isoformat(), now.isoformat()),
            )
            connection.execute(
                "DELETE FROM user_sessions WHERE expires_at <= ?",
                (now.isoformat(),),
            )
        return token

    def user_from_session(self, token: str) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT users.*
                FROM user_sessions
                JOIN users ON users.id = user_sessions.user_id
                WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?
                """,
                (_token_hash(token), now),
            ).fetchone()
        return self._public_user(row) if row else None

    def delete_session(self, token: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "DELETE FROM user_sessions WHERE token_hash = ?",
                (_token_hash(token),),
            )

    def create_password_reset(self, email: str, minutes: int = 30) -> tuple[str, dict[str, Any]] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
                (email.strip().lower(),),
            ).fetchone()
        if row is None:
            return None
        token = secrets.token_urlsafe(48)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=minutes)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO password_reset_tokens (
                    token_hash, user_id, expires_at, created_at
                ) VALUES (?, ?, ?, ?)
                """,
                (_token_hash(token), row["id"], expires_at.isoformat(), now.isoformat()),
            )
        return token, self._public_user(row)

    def reset_password(self, token: str, password: str) -> bool:
        token_digest = _token_hash(token)
        now = datetime.now(timezone.utc)
        with self._lock, self._connect() as connection:
            reset_row = connection.execute(
                """
                SELECT * FROM password_reset_tokens
                WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
                """,
                (token_digest, now.isoformat()),
            ).fetchone()
            if reset_row is None:
                return False
            connection.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (_hash_password(password), now.isoformat(), reset_row["user_id"]),
            )
            connection.execute(
                "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?",
                (now.isoformat(), token_digest),
            )
            connection.execute(
                "DELETE FROM user_sessions WHERE user_id = ?",
                (reset_row["user_id"],),
            )
        return True
