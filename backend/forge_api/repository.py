from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisRepository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = Lock()
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS analysis_jobs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    lift TEXT NOT NULL,
                    profile TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    result_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def create(self, job: dict[str, Any]) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO analysis_jobs (
                    id, user_id, lift, profile, filename, file_path,
                    status, progress, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job["id"],
                    job["user_id"],
                    job["lift"],
                    job["profile"],
                    job["filename"],
                    job["file_path"],
                    job["status"],
                    job["progress"],
                    job["created_at"],
                    job["updated_at"],
                ),
            )

    def update(self, job_id: str, **changes: Any) -> None:
        changes["updated_at"] = utc_now()
        if "result" in changes:
            changes["result_json"] = json.dumps(changes.pop("result"), ensure_ascii=False)
        columns = ", ".join(f"{key} = ?" for key in changes)
        with self._lock, self._connect() as connection:
            connection.execute(
                f"UPDATE analysis_jobs SET {columns} WHERE id = ?",
                [*changes.values(), job_id],
            )

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM analysis_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        if row is None:
            return None
        job = dict(row)
        result_json = job.pop("result_json")
        job["result"] = json.loads(result_json) if result_json else None
        return job
