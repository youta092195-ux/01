from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .auth import AuthRepository
from .config import load_settings
from .models import (
    AnalysisJobResponse,
    AdminAuditResponse,
    AdminStatsResponse,
    AdminUserResponse,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
    JobStatus,
    Lift,
    LoginIdUpdate,
    PasswordUpdate,
    PasswordResetConfirm,
    PasswordResetRequest,
    TrainingProfile,
    UserLogin,
    UserProfileUpdate,
    UserRegistration,
    UserResponse,
    VideoContext,
)
from .mailer import send_password_reset
from .repository import AnalysisRepository, utc_now
from .service import VideoAnalysisService


settings = load_settings()
repository = AnalysisRepository(settings.database_path)
auth_repository = AuthRepository(
    settings.database_path,
    export_user_registry=settings.export_user_registry,
)
auth_repository.promote_configured_admins(settings.admin_login_ids)
service = VideoAnalysisService(repository)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="forge-analysis")
rate_limit_lock = Lock()
rate_limit_events: dict[str, deque[float]] = defaultdict(deque)

app = FastAPI(
    title="AI×MUS Training API",
    version="0.2.0",
    description="AI×MUS web and future mobile application API.",
    docs_url=None if settings.public_base_url.startswith("https://") else "/docs",
    redoc_url=None if settings.public_base_url.startswith("https://") else "/redoc",
    openapi_url=None if settings.public_base_url.startswith("https://") else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Requested-With"],
)


def client_ip(request: Request) -> str:
    return (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def trusted_origins() -> set[str]:
    return {
        origin.rstrip("/")
        for origin in [settings.public_base_url, *settings.allowed_origins]
        if origin
    }


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.url.path.startswith("/api/"):
        origin = request.headers.get("origin", "").rstrip("/")
        fetch_site = request.headers.get("sec-fetch-site", "")
        if fetch_site == "cross-site" or (origin and origin not in trusted_origins()):
            return JSONResponse(status_code=403, content={"detail": "許可されていないリクエストです。"})

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    script_policy = "'self' 'unsafe-inline'" if request.url.path == "/creator.html" else "'self'"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        f"script-src {script_policy}; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; media-src 'self' blob:; "
        "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; "
        "base-uri 'self'; form-action 'self'"
    )
    if is_https_request(request):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "aimus-api", "version": app.version}


@app.get("/api/v1/public-url")
def public_url() -> dict[str, str | None]:
    public_url_file = Path(__file__).resolve().parents[2] / "PUBLIC_URL.txt"
    if not public_url_file.exists():
        return {"url": None}
    url = public_url_file.read_text(encoding="utf-8-sig").strip()
    return {"url": url or None}


def is_https_request(request: Request) -> bool:
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    return request.url.scheme == "https" or forwarded_proto.split(",")[0].strip() == "https"


def request_base_url(request: Request) -> str:
    if settings.public_base_url:
        return settings.public_base_url
    return str(request.base_url).rstrip("/")


def enforce_rate_limit(request: Request, bucket: str, limit: int) -> None:
    key = f"{bucket}:{client_ip(request)}"
    now = monotonic()
    with rate_limit_lock:
        events = rate_limit_events[key]
        while events and now - events[0] > 60:
            events.popleft()
        if len(events) >= limit:
            raise HTTPException(
                status_code=429,
                detail="試行回数が多すぎます。1分ほど待ってから再試行してください。",
            )
        events.append(now)


def set_session_cookie(
    response: Response,
    token: str,
    request: Request,
    days: int,
) -> None:
    response.set_cookie(
        key="forge_session",
        value=token,
        max_age=days * 24 * 60 * 60,
        httponly=True,
        secure=settings.secure_cookies or is_https_request(request),
        samesite="lax",
        path="/",
    )


def current_user(
    forge_session: str | None = Cookie(default=None),
) -> dict:
    if not forge_session:
        raise HTTPException(status_code=401, detail="ログインが必要です。")
    user = auth_repository.user_from_session(forge_session)
    if user is None:
        raise HTTPException(status_code=401, detail="セッションの有効期限が切れています。")
    return user


def current_admin(
    forge_session: str | None = Cookie(default=None),
) -> dict:
    if not forge_session:
        raise HTTPException(status_code=404, detail="Not found")
    user = auth_repository.user_from_session(forge_session)
    if user is None or user.get("role") != "admin" or not user.get("is_active", True):
        raise HTTPException(status_code=404, detail="Not found")
    return user


@app.post("/api/v1/auth/register", response_model=UserResponse, status_code=201)
def register(
    registration: UserRegistration,
    response: Response,
    request: Request,
) -> UserResponse:
    enforce_rate_limit(request, "register", 10)
    try:
        user = auth_repository.create_user(registration)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    token = auth_repository.create_session(user["id"], settings.session_days)
    set_session_cookie(response, token, request, settings.session_days)
    return UserResponse(**user)


@app.post("/api/v1/auth/login", response_model=UserResponse)
def login(
    credentials: UserLogin,
    response: Response,
    request: Request,
) -> UserResponse:
    enforce_rate_limit(request, "login", 5)
    if credentials.login_id.strip().lower() in settings.admin_login_ids:
        auth_repository.promote_configured_admins(settings.admin_login_ids)
    user = auth_repository.authenticate(credentials.login_id, credentials.password)
    if user is None:
        auth_repository.write_audit_log(
            None,
            "login_failed",
            ip_address=client_ip(request),
        )
        raise HTTPException(status_code=401, detail="IDまたはパスワードが正しくありません。")
    session_days = 1 if user.get("role") == "admin" else settings.session_days
    token = auth_repository.create_session(user["id"], session_days)
    set_session_cookie(response, token, request, session_days)
    auth_repository.write_audit_log(
        user,
        "login_succeeded",
        target_user_id=user["id"],
        ip_address=client_ip(request),
    )
    return UserResponse(**user)


@app.get("/api/v1/admin/stats", response_model=AdminStatsResponse)
def admin_stats(admin: dict = Depends(current_admin)) -> AdminStatsResponse:
    return AdminStatsResponse(**auth_repository.admin_stats())


@app.get("/api/v1/admin/users", response_model=list[AdminUserResponse])
def admin_users(
    query: str = "",
    admin: dict = Depends(current_admin),
) -> list[AdminUserResponse]:
    return [AdminUserResponse(**user) for user in auth_repository.list_users(query)]


@app.patch("/api/v1/admin/users/{user_id}/status", response_model=AdminUserResponse)
def admin_update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    request: Request,
    admin: dict = Depends(current_admin),
) -> AdminUserResponse:
    if user_id == admin["id"] and not payload.is_active:
        raise HTTPException(status_code=400, detail="自分自身を停止することはできません。")
    updated = auth_repository.set_user_active(user_id, payload.is_active)
    if updated is None:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません。")
    auth_repository.write_audit_log(
        admin,
        "user_enabled" if payload.is_active else "user_disabled",
        target_user_id=user_id,
        ip_address=client_ip(request),
    )
    return AdminUserResponse(**updated)


@app.patch("/api/v1/admin/users/{user_id}/role", response_model=AdminUserResponse)
def admin_update_user_role(
    user_id: str,
    payload: AdminUserRoleUpdate,
    request: Request,
    admin: dict = Depends(current_admin),
) -> AdminUserResponse:
    if user_id == admin["id"] and payload.role != "admin":
        raise HTTPException(status_code=400, detail="自分自身の管理者権限は解除できません。")
    updated = auth_repository.set_user_role(user_id, payload.role)
    if updated is None:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません。")
    auth_repository.write_audit_log(
        admin,
        "user_role_changed",
        target_user_id=user_id,
        detail=f"role={payload.role}",
        ip_address=client_ip(request),
    )
    return AdminUserResponse(**updated)


@app.post("/api/v1/admin/users/{user_id}/revoke-sessions", status_code=204)
def admin_revoke_sessions(
    user_id: str,
    request: Request,
    admin: dict = Depends(current_admin),
) -> Response:
    auth_repository.revoke_user_sessions(user_id)
    auth_repository.write_audit_log(
        admin,
        "sessions_revoked",
        target_user_id=user_id,
        ip_address=client_ip(request),
    )
    return Response(status_code=204)


@app.get("/api/v1/admin/audit", response_model=list[AdminAuditResponse])
def admin_audit(admin: dict = Depends(current_admin)) -> list[AdminAuditResponse]:
    return [AdminAuditResponse(**entry) for entry in auth_repository.list_audit_logs()]


@app.get("/api/v1/auth/me", response_model=UserResponse)
def get_me(user: dict = Depends(current_user)) -> UserResponse:
    return UserResponse(**user)


@app.patch("/api/v1/auth/profile", response_model=UserResponse)
def update_profile(
    payload: UserProfileUpdate,
    user: dict = Depends(current_user),
) -> UserResponse:
    updated = auth_repository.update_profile(
        user["id"],
        payload.username,
        payload.birth_date.isoformat(),
    )
    return UserResponse(**updated)


@app.patch("/api/v1/auth/login-id", response_model=UserResponse)
def update_login_id(
    payload: LoginIdUpdate,
    user: dict = Depends(current_user),
) -> UserResponse:
    try:
        updated = auth_repository.update_login_id(
            user["id"],
            payload.login_id,
            payload.current_password,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if updated is None:
        raise HTTPException(status_code=401, detail="現在のパスワードが正しくありません。")
    return UserResponse(**updated)


@app.patch("/api/v1/auth/password", status_code=204)
def update_password(
    payload: PasswordUpdate,
    response: Response,
    user: dict = Depends(current_user),
) -> Response:
    if not auth_repository.update_password(
        user["id"],
        payload.current_password,
        payload.new_password,
    ):
        raise HTTPException(status_code=401, detail="現在のパスワードが正しくありません。")
    response.delete_cookie("forge_session", path="/")
    response.status_code = 204
    return response


@app.post("/api/v1/auth/logout", status_code=204)
def logout(
    response: Response,
    forge_session: str | None = Cookie(default=None),
) -> Response:
    if forge_session:
        auth_repository.delete_session(forge_session)
    response.delete_cookie("forge_session", path="/")
    response.status_code = 204
    return response


@app.post("/api/v1/auth/password-reset/request")
def request_password_reset(
    payload: PasswordResetRequest,
    request: Request,
) -> dict[str, str]:
    enforce_rate_limit(request, "password-reset", 5)
    reset = auth_repository.create_password_reset(payload.email)
    if reset is not None:
        token, user = reset
        reset_url = f"{request_base_url(request)}/?reset_token={token}"
        try:
            send_password_reset(settings, user["email"], user["login_id"], reset_url)
        except Exception:
            # Never reveal account existence or SMTP failures to the requester.
            pass
    return {
        "message": "登録されているメールアドレスの場合、再設定リンクを送信しました。"
    }


@app.post("/api/v1/auth/password-reset/confirm")
def confirm_password_reset(request: PasswordResetConfirm) -> dict[str, str]:
    if not auth_repository.reset_password(request.token, request.password):
        raise HTTPException(
            status_code=400,
            detail="再設定リンクが無効か、有効期限が切れています。",
        )
    return {"message": "パスワードを変更しました。新しいパスワードでログインしてください。"}


@app.post("/api/v1/analyses", response_model=AnalysisJobResponse, status_code=202)
def create_analysis(
    video: UploadFile = File(...),
    lift: Lift = Form(...),
    profile: TrainingProfile = Form(...),
    weight_kg: float = Form(..., gt=0),
    rpe: float = Form(..., ge=1, le=10),
    camera_angle: str = Form("side"),
    set_label: str | None = Form(None),
    user: dict = Depends(current_user),
) -> AnalysisJobResponse:
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=415, detail="A video file is required.")
    job_id = str(uuid4())
    extension = Path(video.filename or "training.mp4").suffix.lower() or ".mp4"
    video_path = settings.upload_dir / f"{job_id}{extension}"
    written = 0
    with video_path.open("wb") as output:
        while chunk := video.file.read(1024 * 1024):
            written += len(chunk)
            if written > settings.max_upload_bytes:
                output.close()
                video_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="The uploaded video is too large.")
            output.write(chunk)
    now = utc_now()
    job = {
        "id": job_id,
        "user_id": user["id"],
        "lift": lift.value,
        "profile": profile.value,
        "filename": video.filename or video_path.name,
        "file_path": str(video_path),
        "status": JobStatus.queued.value,
        "progress": 0,
        "created_at": now,
        "updated_at": now,
    }
    repository.create(job)
    context = VideoContext(
        weight_kg=weight_kg,
        rpe=rpe,
        camera_angle=camera_angle,
        set_label=set_label,
    )
    executor.submit(service.run, job_id, video_path, lift, profile, context)
    return AnalysisJobResponse(**repository.get(job_id))


@app.get("/api/v1/analyses/{job_id}", response_model=AnalysisJobResponse)
def get_analysis(
    job_id: str,
    user: dict = Depends(current_user),
) -> AnalysisJobResponse:
    job = repository.get(job_id)
    if job is None or job["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Analysis job was not found.")
    return AnalysisJobResponse(**job)


frontend_dir = Path(__file__).resolve().parents[2]
frontend_headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


@app.get("/", include_in_schema=False)
def web_app() -> FileResponse:
    return FileResponse(frontend_dir / "index.html", headers=frontend_headers)


@app.get("/reset-password", include_in_schema=False)
def reset_password_page() -> FileResponse:
    return FileResponse(frontend_dir / "index.html", headers=frontend_headers)


@app.get("/app.js", include_in_schema=False)
def web_app_script() -> FileResponse:
    return FileResponse(
        frontend_dir / "app.js",
        media_type="application/javascript",
        headers=frontend_headers,
    )


@app.get("/styles.css", include_in_schema=False)
def web_app_styles() -> FileResponse:
    return FileResponse(
        frontend_dir / "styles.css",
        media_type="text/css",
        headers=frontend_headers,
    )


@app.get("/app-icon.png", include_in_schema=False)
def web_app_icon() -> FileResponse:
    return FileResponse(
        frontend_dir / "app-icon.png",
        media_type="image/png",
        headers=frontend_headers,
    )


@app.get("/admin.html", include_in_schema=False)
def admin_portal() -> FileResponse:
    return FileResponse(frontend_dir / "admin.html", headers=frontend_headers)


@app.get("/admin.js", include_in_schema=False)
def admin_script() -> FileResponse:
    return FileResponse(
        frontend_dir / "admin.js",
        media_type="application/javascript",
        headers=frontend_headers,
    )


@app.get("/admin.css", include_in_schema=False)
def admin_styles() -> FileResponse:
    return FileResponse(
        frontend_dir / "admin.css",
        media_type="text/css",
        headers=frontend_headers,
    )


@app.get("/creator.html", include_in_schema=False)
def creator_portal(request: Request) -> FileResponse:
    host = request.headers.get("host", "").split(":", 1)[0].lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(frontend_dir / "creator.html")
