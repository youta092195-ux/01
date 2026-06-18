from __future__ import annotations

from statistics import mean

import numpy as np

from .models import (
    AnalysisMetric,
    AnalysisResult,
    Lift,
    MenuAdjustment,
    RuleEvaluation,
    TrainingProfile,
    VideoContext,
)
from .pose import PoseSequence, available_angles


def _score(value: float, ideal: float, tolerance: float) -> float:
    return float(np.clip(100 - abs(value - ideal) / tolerance * 35, 35, 100))


def _symmetry(sequence: PoseSequence, joints: tuple[str, str, str]) -> tuple[float, float]:
    left = available_angles(sequence.frames, f"left_{joints[0]}", f"left_{joints[1]}", f"left_{joints[2]}")
    right = available_angles(sequence.frames, f"right_{joints[0]}", f"right_{joints[1]}", f"right_{joints[2]}")
    count = min(len(left), len(right))
    if not count:
        return 0, 50
    difference = float(mean(abs(left[index] - right[index]) for index in range(count)))
    return difference, float(np.clip(100 - difference * 5, 35, 100))


def _midpoint_series(sequence: PoseSequence, left: str, right: str) -> list[tuple[float, float, float]]:
    series: list[tuple[float, float, float]] = []
    for frame in sequence.frames:
        if left not in frame.landmarks or right not in frame.landmarks:
            continue
        left_point = frame.landmarks[left]
        right_point = frame.landmarks[right]
        series.append(
            (
                frame.timestamp_ms,
                (left_point[0] + right_point[0]) / 2,
                (left_point[1] + right_point[1]) / 2,
            )
        )
    return series


def _path_metrics(sequence: PoseSequence, lift: Lift) -> tuple[float, float, float]:
    if lift == Lift.squat:
        series = _midpoint_series(sequence, "left_shoulder", "right_shoulder")
    else:
        series = _midpoint_series(sequence, "left_wrist", "right_wrist")
    if len(series) < 4:
        return 0, 0, 0.35
    x_values = np.array([point[1] for point in series])
    y_values = np.array([point[2] for point in series])
    horizontal_deviation = float((x_values.max() - x_values.min()) * 100)
    bottom_index = int(np.argmax(y_values))
    bottom_y = y_values[bottom_index]
    threshold = max(0.006, float(np.ptp(y_values)) * 0.06)
    pause_frames = 0
    for index in range(bottom_index, -1, -1):
        if abs(y_values[index] - bottom_y) <= threshold:
            pause_frames += 1
        else:
            break
    for index in range(bottom_index + 1, len(y_values)):
        if abs(y_values[index] - bottom_y) <= threshold:
            pause_frames += 1
        else:
            break
    pause_seconds = pause_frames / max(sequence.fps, 1)
    confidence = float(np.clip(len(series) / max(len(sequence.frames), 1), 0.35, 0.95))
    return horizontal_deviation, pause_seconds, confidence


def _objective_rpe(sequence: PoseSequence, lift: Lift, form_score: float) -> tuple[float, float]:
    if lift == Lift.squat:
        series = _midpoint_series(sequence, "left_shoulder", "right_shoulder")
    else:
        series = _midpoint_series(sequence, "left_wrist", "right_wrist")
    if len(series) < 5:
        return 8.0, 0.35
    total_motion = sum(
        abs(series[index][2] - series[index - 1][2])
        for index in range(1, len(series))
    )
    duration = max((series[-1][0] - series[0][0]) / 1000, 0.25)
    normalized_speed = total_motion / duration
    speed_rpe = 10 - normalized_speed * 9
    form_penalty = max(0, 78 - form_score) / 18
    estimated = float(np.clip(speed_rpe + form_penalty, 6, 10))
    confidence = float(np.clip(len(series) / max(len(sequence.frames), 1), 0.4, 0.9))
    return round(estimated * 2) / 2, confidence


class LiftEvaluator:
    def evaluate(
        self,
        sequence: PoseSequence,
        lift: Lift,
        profile: TrainingProfile,
        context: VideoContext,
    ) -> AnalysisResult:
        evaluator = {
            Lift.bench: self._bench,
            Lift.squat: self._squat,
            Lift.deadlift: self._deadlift,
        }[lift]
        metrics, base_advice, rule_checks = evaluator(sequence)
        path_deviation, pause_seconds, motion_confidence = _path_metrics(sequence, lift)
        metrics.extend(
            [
                AnalysisMetric(
                    key="bar_path_deviation",
                    label="バーの通り道",
                    value=round(path_deviation, 1),
                    unit="%画面幅",
                    score=float(np.clip(100 - path_deviation * 8, 30, 100)),
                    interpretation=(
                        "手首中点からバーの横方向の移動を推定しています。"
                        + ("同じ軌道を再現できています。" if path_deviation <= 3 else "押し始めや中盤でバーが横へ流れています。")
                    ),
                    recommendation=(
                        "胸から顔側へ緩やかに戻る軌道を意識し、ラック方向へ急に流さないでください。"
                        if lift == Lift.bench
                        else "身体に近い一定の軌道を維持してください。"
                    ),
                ),
                AnalysisMetric(
                    key="bottom_pause",
                    label="ボトムでのコントロール",
                    value=round(pause_seconds, 2),
                    unit="秒",
                    score=float(np.clip(55 + pause_seconds * 35, 40, 100)),
                    interpretation=(
                        "最下点付近で切り返しを急がず、重量を制御できているかを確認しています。"
                        + ("明確なコントロールが見られます。" if pause_seconds >= 0.45 else "切り返しが速く、胸での静止が不明瞭です。")
                    ),
                    recommendation=(
                        "競技練習では胸で一度静止し、合図を待つつもりで押し始めてください。"
                        if lift == Lift.bench
                        else "最下点で姿勢を崩さず、反動に頼らず切り返してください。"
                    ),
                ),
            ]
        )
        numeric_scores = [metric.score for metric in metrics if metric.score is not None]
        overall = round(mean(numeric_scores), 1) if numeric_scores else 50.0
        objective_rpe, rpe_confidence = _objective_rpe(sequence, lift, overall)
        profile_advice, menu = self._profile_adjustments(
            profile,
            metrics,
            context,
            objective_rpe,
            overall,
        )
        verdict = "良好" if overall >= 82 else "概ね良好" if overall >= 70 else "要修正"
        load_comment = self._load_comment(context, objective_rpe, overall)
        strengths = [
            metric.label
            for metric in sorted(metrics, key=lambda item: item.score or 0, reverse=True)[:2]
        ]
        priorities = [
            f"{metric.label}を改善（現在評価 {round(metric.score or 0)}）"
            for metric in sorted(metrics, key=lambda item: item.score or 0)[:2]
        ]
        rule_evaluations = self._rule_evaluations(
            lift,
            metrics,
            pause_seconds,
            motion_confidence,
        )
        return AnalysisResult(
            score=overall,
            lift=lift,
            profile=profile,
            model_name=sequence.model_name,
            model_version=sequence.model_version,
            frames_analyzed=len(sequence.frames),
            context=context,
            objective_rpe=objective_rpe,
            rpe_difference=round(objective_rpe - context.rpe, 1),
            rpe_confidence=rpe_confidence,
            verdict=verdict,
            executive_summary=(
                f"{context.weight_kg:g}kg・申告RPE {context.rpe:g}に対し、動画推定RPEは"
                f"{objective_rpe:g}です。{load_comment}"
                f" 総合評価は{verdict}（{overall:g}/100）です。"
            ),
            metrics=metrics,
            strengths=strengths,
            priorities=priorities,
            advice=[*base_advice, *profile_advice],
            rule_checks=rule_checks if profile == TrainingProfile.powerlifting else [],
            rule_evaluations=rule_evaluations if profile == TrainingProfile.powerlifting else [],
            rule_source=(
                "https://www.powerlifting.sport/rules/codes/info/technical-rules"
                if profile == TrainingProfile.powerlifting
                else None
            ),
            menu_adjustment=menu,
            debug={"duration_seconds": round(sequence.duration_seconds, 2)},
        )

    def _load_comment(self, context: VideoContext, objective_rpe: float, score: float) -> str:
        rpe_difference = objective_rpe - context.rpe
        if rpe_difference >= 1:
            return f"動画では申告よりRPEが{rpe_difference:g}高く見え、本人の感覚以上に余力が少ない可能性があります。"
        if rpe_difference <= -1:
            return f"動画では申告よりRPEが{abs(rpe_difference):g}低く見え、追加反復または小幅な増量余地があります。"
        if context.rpe >= 9 and score < 75:
            return "高強度下でフォーム低下が見られるため、次回は重量を2.5〜5%下げて再現性を優先してください。"
        if context.rpe <= 7 and score >= 80:
            return "余力を保ちながらフォームも安定しており、次回の小幅な増量候補です。"
        if context.rpe >= 9:
            return "高強度ですがフォームは維持されています。試合ピーキング以外では頻度を抑えてください。"
        return "申告RPEとフォーム評価は概ね整合しています。"

    def _rule_evaluations(
        self,
        lift: Lift,
        metrics: list[AnalysisMetric],
        pause_seconds: float,
        confidence: float,
    ) -> list[RuleEvaluation]:
        by_key = {metric.key: metric for metric in metrics}
        evaluations: list[RuleEvaluation] = []
        if lift == Lift.bench:
            pause_status = "pass" if pause_seconds >= 0.45 else "warn"
            evaluations.append(
                RuleEvaluation(
                    item="胸上での静止",
                    status=pause_status,
                    evidence=f"手首中点のボトム滞在時間 {pause_seconds:.2f}秒",
                    confidence=confidence * 0.8,
                )
            )
            evaluations.append(
                RuleEvaluation(
                    item="肘のロックアウト",
                    status="review",
                    evidence=f"ボトム肘角度 {by_key['bottom_elbow'].value}°。開始・終了フレームの目視確認が必要",
                    confidence=confidence * 0.65,
                )
            )
        elif lift == Lift.squat:
            depth = float(by_key["squat_depth"].value)
            evaluations.append(
                RuleEvaluation(
                    item="スクワット深さ",
                    status="pass" if depth <= 78 else "warn",
                    evidence=f"推定股関節角度 {depth:.1f}°。股関節上面と膝上面の直接比較は要目視",
                    confidence=confidence * 0.72,
                )
            )
        else:
            hip = float(by_key["hip_lockout"].value)
            knee = float(by_key["knee_lockout"].value)
            evaluations.append(
                RuleEvaluation(
                    item="最終ロックアウト",
                    status="pass" if hip >= 168 and knee >= 168 else "warn",
                    evidence=f"股関節 {hip:.1f}°・膝 {knee:.1f}°",
                    confidence=confidence * 0.8,
                )
            )
        evaluations.append(
            RuleEvaluation(
                item="審判コマンド・反則動作",
                status="review",
                evidence="音声コマンド、足・尻の接触、バーの下降は単眼姿勢推定だけでは確定不可",
                confidence=0.35,
            )
        )
        return evaluations

    def _bench(self, sequence: PoseSequence):
        elbows = (
            available_angles(sequence.frames, "left_shoulder", "left_elbow", "left_wrist")
            + available_angles(sequence.frames, "right_shoulder", "right_elbow", "right_wrist")
        )
        minimum_elbow = min(elbows) if elbows else 90
        symmetry, symmetry_score = _symmetry(sequence, ("shoulder", "elbow", "wrist"))
        metrics = [
            AnalysisMetric(
                key="bottom_elbow",
                label="胸で受ける位置と前腕の向き",
                value=round(minimum_elbow, 1),
                unit="°",
                score=_score(minimum_elbow, 75, 25),
                interpretation=(
                    "胸に下ろした時の肘の曲がり方を確認しています。"
                    + ("前腕を立てやすい範囲に収まっています。" if 60 <= minimum_elbow <= 90 else "肘が流れ、力をバーへ伝えにくい可能性があります。")
                ),
                recommendation="胸へのタッチ位置を微調整し、ボトムで手首が肘のほぼ真上に来る位置を探してください。",
            ),
            AnalysisMetric(
                key="arm_symmetry",
                label="左右の押し方",
                value=round(symmetry, 1),
                unit="°",
                score=symmetry_score,
                interpretation=(
                    "左右の肩・肘・手首の動きを比較しています。"
                    + ("左右はほぼ同時に動いています。" if symmetry <= 4 else "片側が先に押し上がる、または肘の開き方に差があります。")
                ),
                recommendation="軽い重量で左右同時に胸から離す練習を行い、苦手側の肩甲骨をベンチへ固定してください。",
            ),
            AnalysisMetric(
                key="stability",
                label="土台の安定性",
                value=round((symmetry_score + 78) / 2),
                score=(symmetry_score + 78) / 2,
                interpretation="肩周辺の揺れと左右差から、上半身の土台がセット中に維持できているかを評価しています。",
                recommendation="ラックアウト前に肩甲骨を寄せて下げ、足で床を押した状態を胸へのタッチまで維持してください。",
            ),
        ]
        advice = ["手首を肘のほぼ真上に保ち、前腕が床に対して垂直になる軌道を優先してください。"]
        rules = ["胸部で明確に静止できているかは、側面映像とバー検出を併用して最終判定してください。", "肘の完全伸展とラックの合図を確認してください。"]
        return metrics, advice, rules

    def _squat(self, sequence: PoseSequence):
        knees = (
            available_angles(sequence.frames, "left_hip", "left_knee", "left_ankle")
            + available_angles(sequence.frames, "right_hip", "right_knee", "right_ankle")
        )
        hips = (
            available_angles(sequence.frames, "left_shoulder", "left_hip", "left_knee")
            + available_angles(sequence.frames, "right_shoulder", "right_hip", "right_knee")
        )
        minimum_knee = min(knees) if knees else 100
        minimum_hip = min(hips) if hips else 90
        symmetry, symmetry_score = _symmetry(sequence, ("hip", "knee", "ankle"))
        depth_score = _score(minimum_hip, 70, 25)
        metrics = [
            AnalysisMetric(key="squat_depth", label="推定深度", value=round(minimum_hip, 1), unit="°", score=depth_score),
            AnalysisMetric(key="knee_angle", label="ボトム膝角度", value=round(minimum_knee, 1), unit="°", score=_score(minimum_knee, 85, 30)),
            AnalysisMetric(key="lower_symmetry", label="左右差", value=round(symmetry, 1), unit="°", score=symmetry_score),
        ]
        advice = ["足裏3点の接地を維持し、切り返しで膝と股関節を同時に伸ばしてください。"]
        rules = ["股関節上面が膝上面より低い位置へ到達しているかを側面映像で確認してください。", "開始・終了時の膝伸展と直立姿勢を確認してください。"]
        return metrics, advice, rules

    def _deadlift(self, sequence: PoseSequence):
        hips = (
            available_angles(sequence.frames, "left_shoulder", "left_hip", "left_knee")
            + available_angles(sequence.frames, "right_shoulder", "right_hip", "right_knee")
        )
        knees = (
            available_angles(sequence.frames, "left_hip", "left_knee", "left_ankle")
            + available_angles(sequence.frames, "right_hip", "right_knee", "right_ankle")
        )
        lockout_hip = max(hips) if hips else 165
        lockout_knee = max(knees) if knees else 165
        symmetry, symmetry_score = _symmetry(sequence, ("shoulder", "hip", "knee"))
        metrics = [
            AnalysisMetric(key="hip_lockout", label="股関節ロックアウト", value=round(lockout_hip, 1), unit="°", score=_score(lockout_hip, 175, 15)),
            AnalysisMetric(key="knee_lockout", label="膝ロックアウト", value=round(lockout_knee, 1), unit="°", score=_score(lockout_knee, 175, 15)),
            AnalysisMetric(key="torso_symmetry", label="体幹左右差", value=round(symmetry, 1), unit="°", score=symmetry_score),
        ]
        advice = ["バーを身体に近づけ、床を押す局面から股関節伸展へ滑らかにつないでください。"]
        rules = ["最終姿勢で膝と股関節が伸展し、肩が後方へ収まっているか確認してください。", "ダウンの合図前にバーを下ろしていないか確認してください。"]
        return metrics, advice, rules

    def _profile_adjustments(
        self,
        profile: TrainingProfile,
        metrics: list[AnalysisMetric],
        context: VideoContext,
        objective_rpe: float,
        overall_score: float,
    ) -> tuple[list[str], MenuAdjustment]:
        average_score = mean(metric.score for metric in metrics if metric.score is not None)
        load_change = 0.0
        if objective_rpe >= 9 or overall_score < 70:
            load_change = -5.0
        elif objective_rpe <= 7.5 and overall_score >= 80:
            load_change = 2.5
        target_weight = round((context.weight_kg * (1 + load_change / 100)) / 2.5) * 2.5
        target_reps = "1〜3回" if profile == TrainingProfile.powerlifting else "5〜8回"
        if objective_rpe >= 9:
            target_reps = "1〜2回" if profile == TrainingProfile.powerlifting else "3〜5回"
        rationale = (
            f"動画推定RPE {objective_rpe:g}、フォーム評価 {overall_score:g}/100を基準に算出。"
        )
        if profile == TrainingProfile.bodybuilding:
            return (
                ["可動域とエキセントリック局面を優先し、対象筋の張力時間をそろえてください。"],
                MenuAdjustment(
                    summary=f"次回は{target_weight:g}kgで{target_reps}。フォームを維持できれば補助種目を1セット追加",
                    load_change_percent=load_change,
                    set_change=1,
                    target_weight_kg=target_weight,
                    target_reps=target_reps,
                    rationale=rationale,
                ),
            )
        if profile == TrainingProfile.powerlifting:
            return (
                ["競技コマンドを想定し、開始・静止・終了姿勢を毎レップ統一してください。"],
                MenuAdjustment(
                    summary=f"次回トップセットは{target_weight:g}kgで{target_reps}、目標RPE 8",
                    load_change_percent=load_change,
                    target_weight_kg=target_weight,
                    target_reps=target_reps,
                    rationale=rationale,
                ),
            )
        if profile == TrainingProfile.athlete:
            return (
                ["低回数で挙上速度を保ち、疲労で動作速度が落ちる前にセットを終了してください。"],
                MenuAdjustment(
                    summary=f"次回は{target_weight:g}kgで{target_reps}、速度低下前に終了",
                    load_change_percent=load_change,
                    rep_change=-2,
                    target_weight_kg=target_weight,
                    target_reps=target_reps,
                    rationale=rationale,
                ),
            )
        return (
            ["痛みのない範囲で再現性を優先し、良好なフォームの反復数を増やしてください。"],
            MenuAdjustment(
                summary=f"次回は{target_weight:g}kgで{target_reps}、目標RPE 7〜8",
                load_change_percent=load_change,
                rep_change=1 if load_change >= 0 else 0,
                target_weight_kg=target_weight,
                target_reps=target_reps,
                rationale=rationale,
            ),
        )
