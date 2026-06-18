from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .auth import AuthRepository
from .config import load_settings
from .models import (
    AnalysisJobResponse,
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
auth_repository = AuthRepository(settings.database_path)
service = VideoAnalysisService(repository)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="forge-analysis")
rate_limit_lock = Lock()
rate_limit_events: dict[str, deque[float]] = defaultdict(deque)

app = FastAPI(
    title="AI×MUS Training API",
    version="0.2.0",
    description="AI×MUS web and future mobile application API.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    forwarded_host = request.headers.get("x-forwarded-host")
    host = forwarded_host or request.headers.get("host")
    scheme = "https" if is_https_request(request) else request.url.scheme
    return f"{scheme}://{host}".rstrip("/") if host else settings.public_base_url


def enforce_rate_limit(request: Request, bucket: str, limit: int) -> None:
    client_ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    key = f"{bucket}:{client_ip}"
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


def set_session_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        key="forge_session",
        value=token,
        max_age=settings.session_days * 24 * 60 * 60,
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
    set_session_cookie(response, token, request)
    return UserResponse(**user)


@app.post("/api/v1/auth/login", response_model=UserResponse)
def login(
    credentials: UserLogin,
    response: Response,
    request: Request,
) -> UserResponse:
    enforce_rate_limit(request, "login", 10)
    user = auth_repository.authenticate(credentials.login_id, credentials.password)
    if user is None:
        raise HTTPException(status_code=401, detail="IDまたはパスワードが正しくありません。")
    token = auth_repository.create_session(user["id"], settings.session_days)
    set_session_cookie(response, token, request)
    return UserResponse(**user)


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


@app.get("/creator.html", include_in_schema=False)
def creator_portal(request: Request) -> FileResponse:
    host = request.headers.get("host", "").split(":", 1)[0].lower()
    if host not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(frontend_dir / "creator.html")
