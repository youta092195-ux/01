from __future__ import annotations

import os
from dataclasses import dataclass
from math import acos, degrees
from pathlib import Path
from typing import Iterable

import numpy as np


Point = tuple[float, float, float]


@dataclass
class PoseFrame:
    timestamp_ms: float
    landmarks: dict[str, Point]


@dataclass
class PoseSequence:
    frames: list[PoseFrame]
    fps: float
    duration_seconds: float
    model_name: str
    model_version: str


def angle(a: Point, b: Point, c: Point) -> float:
    first = np.array(a[:2], dtype=float) - np.array(b[:2], dtype=float)
    second = np.array(c[:2], dtype=float) - np.array(b[:2], dtype=float)
    denominator = np.linalg.norm(first) * np.linalg.norm(second)
    if denominator == 0:
        return 0.0
    cosine = float(np.clip(np.dot(first, second) / denominator, -1.0, 1.0))
    return degrees(acos(cosine))


class MediaPipePoseEstimator:
    """CPU pose estimator. Replace this adapter for MoveNet or a GPU service."""

    LANDMARKS = {
        "left_shoulder": 11,
        "right_shoulder": 12,
        "left_elbow": 13,
        "right_elbow": 14,
        "left_wrist": 15,
        "right_wrist": 16,
        "left_hip": 23,
        "right_hip": 24,
        "left_knee": 25,
        "right_knee": 26,
        "left_ankle": 27,
        "right_ankle": 28,
        "left_heel": 29,
        "right_heel": 30,
        "left_foot": 31,
        "right_foot": 32,
    }

    def analyze(self, video_path: Path, sample_fps: float = 8.0) -> PoseSequence:
        matplotlib_cache = video_path.parent.parent / "cache" / "matplotlib"
        matplotlib_cache.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("MPLCONFIGDIR", str(matplotlib_cache))
        try:
            import cv2
            import mediapipe as mp
        except ImportError as error:
            raise RuntimeError(
                "Pose dependencies are not installed. Run: pip install -r backend/requirements.txt"
            ) from error

        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError("The uploaded video could not be opened.")
        fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        duration = frame_count / fps if fps else 0
        sample_every = max(1, round(fps / sample_fps))
        frames: list[PoseFrame] = []

        pose_module = mp.solutions.pose
        with pose_module.Pose(
            static_image_mode=False,
            model_complexity=2,
            smooth_landmarks=True,
            min_detection_confidence=0.55,
            min_tracking_confidence=0.55,
        ) as pose:
            index = 0
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                if index % sample_every:
                    index += 1
                    continue
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose.process(rgb)
                if result.pose_landmarks:
                    values = result.pose_landmarks.landmark
                    landmarks = {
                        name: (values[position].x, values[position].y, values[position].z)
                        for name, position in self.LANDMARKS.items()
                        if values[position].visibility >= 0.45
                    }
                    frames.append(PoseFrame(index / fps * 1000, landmarks))
                index += 1
        capture.release()
        if len(frames) < 5:
            raise RuntimeError("姿勢を十分に検出できませんでした。全身が映る角度で再撮影してください。")
        return PoseSequence(
            frames=frames,
            fps=sample_fps,
            duration_seconds=duration,
            model_name="MediaPipe Pose",
            model_version="0.10",
        )


def available_angles(
    frames: Iterable[PoseFrame],
    first: str,
    center: str,
    last: str,
) -> list[float]:
    values: list[float] = []
    for frame in frames:
        if all(name in frame.landmarks for name in (first, center, last)):
            values.append(
                angle(
                    frame.landmarks[first],
                    frame.landmarks[center],
                    frame.landmarks[last],
                )
            )
    return values
