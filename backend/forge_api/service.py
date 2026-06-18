from __future__ import annotations

from pathlib import Path

from .evaluator import LiftEvaluator
from .models import JobStatus, Lift, TrainingProfile, VideoContext
from .pose import MediaPipePoseEstimator
from .repository import AnalysisRepository


class VideoAnalysisService:
    def __init__(
        self,
        repository: AnalysisRepository,
        pose_estimator: MediaPipePoseEstimator | None = None,
        evaluator: LiftEvaluator | None = None,
    ) -> None:
        self.repository = repository
        self.pose_estimator = pose_estimator or MediaPipePoseEstimator()
        self.evaluator = evaluator or LiftEvaluator()

    def run(
        self,
        job_id: str,
        video_path: Path,
        lift: Lift,
        profile: TrainingProfile,
        context: VideoContext,
    ) -> None:
        try:
            self.repository.update(job_id, status=JobStatus.processing.value, progress=10)
            sequence = self.pose_estimator.analyze(video_path)
            self.repository.update(job_id, progress=75)
            result = self.evaluator.evaluate(sequence, lift, profile, context)
            self.repository.update(
                job_id,
                status=JobStatus.completed.value,
                progress=100,
                result=result.model_dump(mode="json"),
            )
        except Exception as error:
            self.repository.update(
                job_id,
                status=JobStatus.failed.value,
                progress=100,
                error=str(error),
            )
