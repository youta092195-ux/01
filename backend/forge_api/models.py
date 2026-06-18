from __future__ import annotations

from enum import Enum
from datetime import date
from typing import Any

from pydantic import BaseModel, Field, field_validator


class Lift(str, Enum):
    bench = "bench"
    squat = "squat"
    deadlift = "deadlift"


class TrainingProfile(str, Enum):
    general = "general"
    bodybuilding = "bodybuilding"
    powerlifting = "powerlifting"
    athlete = "athlete"


class UserRegistration(BaseModel):
    login_id: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=1, max_length=30)
    birth_date: date
    weight_kg: float = Field(gt=20, le=400)
    purpose: TrainingProfile
    notifications: bool = True
    bench_max: float | None = Field(default=None, gt=0, le=1000)
    squat_max: float | None = Field(default=None, gt=0, le=1000)
    deadlift_max: float | None = Field(default=None, gt=0, le=1000)
    target_weight_kg: float | None = Field(default=None, gt=20, le=400)
    goal_text: str | None = Field(default=None, max_length=300)

    @field_validator("login_id", "username")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("空白だけでは登録できません。")
        return value

    @field_validator("login_id")
    @classmethod
    def validate_login_id(cls, value: str) -> str:
        if any(character.isspace() for character in value):
            raise ValueError("IDに空白は使用できません。")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if value.count("@") != 1 or "." not in value.split("@", 1)[1]:
            raise ValueError("有効なメールアドレスを入力してください。")
        return value


class UserLogin(BaseModel):
    login_id: str
    password: str


class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return UserRegistration.validate_email(value)


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=8, max_length=128)


class UserProfileUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    birth_date: date


class LoginIdUpdate(BaseModel):
    login_id: str = Field(min_length=3, max_length=64)
    current_password: str = Field(min_length=8, max_length=128)

    @field_validator("login_id")
    @classmethod
    def validate_login_id(cls, value: str) -> str:
        return UserRegistration.validate_login_id(value.strip())


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: str
    member_number: str | None = None
    login_id: str
    email: str | None = None
    username: str
    birth_date: date | None = None
    weight_kg: float
    purpose: TrainingProfile
    notifications: bool
    bench_max: float | None = None
    squat_max: float | None = None
    deadlift_max: float | None = None
    target_weight_kg: float | None = None
    goal_text: str | None = None
    created_at: str


class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class AnalysisMetric(BaseModel):
    key: str
    label: str
    value: float | str
    unit: str | None = None
    score: float | None = Field(default=None, ge=0, le=100)
    interpretation: str | None = None
    recommendation: str | None = None


class MenuAdjustment(BaseModel):
    summary: str
    load_change_percent: float = 0
    set_change: int = 0
    rep_change: int = 0
    target_weight_kg: float | None = None
    target_reps: str | None = None
    rationale: str | None = None


class VideoContext(BaseModel):
    weight_kg: float = Field(gt=0)
    rpe: float = Field(ge=1, le=10)
    camera_angle: str = "side"
    set_label: str | None = None


class RuleEvaluation(BaseModel):
    item: str
    status: str
    evidence: str
    confidence: float = Field(ge=0, le=1)


class AnalysisResult(BaseModel):
    score: float = Field(ge=0, le=100)
    lift: Lift
    profile: TrainingProfile
    model_name: str
    model_version: str
    frames_analyzed: int
    context: VideoContext
    objective_rpe: float = Field(ge=1, le=10)
    rpe_difference: float
    rpe_confidence: float = Field(ge=0, le=1)
    verdict: str
    executive_summary: str
    metrics: list[AnalysisMetric]
    strengths: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    advice: list[str]
    rule_checks: list[str] = Field(default_factory=list)
    rule_evaluations: list[RuleEvaluation] = Field(default_factory=list)
    rule_source: str | None = None
    menu_adjustment: MenuAdjustment
    debug: dict[str, Any] = Field(default_factory=dict)


class AnalysisJobResponse(BaseModel):
    id: str
    status: JobStatus
    lift: Lift
    profile: TrainingProfile
    filename: str
    created_at: str
    updated_at: str
    progress: int = Field(ge=0, le=100)
    error: str | None = None
    result: AnalysisResult | None = None
