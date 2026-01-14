"""
Action Recognition Service - Classify actions from pose landmarks.

Detects actions like sitting, standing, walking, bending, and reaching
from MediaPipe pose landmarks.
"""

from enum import Enum
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging

import numpy as np

logger = logging.getLogger(__name__)


class ActionType(str, Enum):
    STANDING = "standing"
    SITTING = "sitting"
    WALKING = "walking"
    BENDING = "bending"
    REACHING = "reaching"
    UNKNOWN = "unknown"


class PoseLandmark:
    """MediaPipe pose landmark indices."""
    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32


class ActionService:
    """Service for action recognition from pose data."""

    # Track recent positions for walking detection
    _person_positions: Dict[int, List[Tuple[float, float, datetime]]] = {}

    # Track current action per person
    _current_actions: Dict[int, Tuple[ActionType, datetime]] = {}

    @staticmethod
    def classify_action(pose_landmarks: List[Dict], person_id: int = None) -> Tuple[ActionType, float]:
        """
        Classify action from pose landmarks.

        Args:
            pose_landmarks: List of {x, y, z, visibility} for each landmark
            person_id: Optional person ID for motion tracking

        Returns:
            (ActionType, confidence)
        """
        if not pose_landmarks or len(pose_landmarks) < 29:
            return ActionType.UNKNOWN, 0.0

        try:
            # Extract key points
            nose = pose_landmarks[PoseLandmark.NOSE]
            l_shoulder = pose_landmarks[PoseLandmark.LEFT_SHOULDER]
            r_shoulder = pose_landmarks[PoseLandmark.RIGHT_SHOULDER]
            l_hip = pose_landmarks[PoseLandmark.LEFT_HIP]
            r_hip = pose_landmarks[PoseLandmark.RIGHT_HIP]
            l_knee = pose_landmarks[PoseLandmark.LEFT_KNEE]
            r_knee = pose_landmarks[PoseLandmark.RIGHT_KNEE]
            l_ankle = pose_landmarks[PoseLandmark.LEFT_ANKLE]
            r_ankle = pose_landmarks[PoseLandmark.RIGHT_ANKLE]
            l_wrist = pose_landmarks[PoseLandmark.LEFT_WRIST]
            r_wrist = pose_landmarks[PoseLandmark.RIGHT_WRIST]

            # Check visibility - need key landmarks to be visible
            min_visibility = 0.3
            key_landmarks = [l_shoulder, r_shoulder, l_hip, r_hip, l_knee, r_knee]
            avg_visibility = sum(lm.get('visibility', 0) for lm in key_landmarks) / len(key_landmarks)

            if avg_visibility < min_visibility:
                return ActionType.UNKNOWN, 0.0

            # Calculate body metrics (y increases downward in normalized coords)
            shoulder_y = (l_shoulder['y'] + r_shoulder['y']) / 2
            hip_y = (l_hip['y'] + r_hip['y']) / 2
            knee_y = (l_knee['y'] + r_knee['y']) / 2
            ankle_y = (l_ankle['y'] + r_ankle['y']) / 2

            shoulder_x = (l_shoulder['x'] + r_shoulder['x']) / 2
            hip_x = (l_hip['x'] + r_hip['x']) / 2

            torso_length = abs(hip_y - shoulder_y)
            leg_length = abs(ankle_y - hip_y)

            # Hip-knee ratio (for sitting detection)
            hip_to_knee = abs(knee_y - hip_y)
            hip_knee_ratio = hip_to_knee / (torso_length + 0.001)

            # Torso angle (for bending detection)
            torso_horizontal = abs(shoulder_x - hip_x)
            torso_vertical = abs(shoulder_y - hip_y)
            torso_angle = np.arctan2(torso_horizontal, torso_vertical) * 180 / np.pi

            # Wrist height (for reaching detection)
            wrist_y = min(l_wrist['y'], r_wrist['y'])
            wrist_visibility = max(l_wrist.get('visibility', 0), r_wrist.get('visibility', 0))
            reaching_up = wrist_y < shoulder_y - torso_length * 0.3 and wrist_visibility > 0.3

            # Check for walking (requires position history)
            is_walking = False
            if person_id is not None:
                is_walking = ActionService._check_walking(person_id, hip_x, hip_y)

            # Classification logic with confidence
            confidence = min(avg_visibility, 0.9)

            # Sitting: knees are at similar height to hips, or hip-knee distance is small
            if hip_knee_ratio < 0.3 and leg_length < torso_length * 1.2:
                return ActionType.SITTING, confidence

            # Bending: torso is angled forward significantly
            if torso_angle > 30:
                return ActionType.BENDING, confidence * 0.85

            # Reaching: arms raised above shoulders
            if reaching_up:
                return ActionType.REACHING, confidence * 0.85

            # Walking: detected movement over time
            if is_walking:
                return ActionType.WALKING, confidence * 0.8

            # Default: standing
            return ActionType.STANDING, confidence

        except Exception as e:
            logger.warning(f"Action classification error: {e}")
            return ActionType.UNKNOWN, 0.0

    @staticmethod
    def _check_walking(person_id: int, x: float, y: float) -> bool:
        """Check if person is walking based on position history."""
        now = datetime.utcnow()

        # Initialize history if needed
        if person_id not in ActionService._person_positions:
            ActionService._person_positions[person_id] = []

        history = ActionService._person_positions[person_id]

        # Add current position
        history.append((x, y, now))

        # Keep only last 2 seconds of history
        cutoff = now - timedelta(seconds=2)
        history[:] = [(px, py, t) for px, py, t in history if t > cutoff]

        # Need at least 3 points to detect motion
        if len(history) < 3:
            return False

        # Calculate total displacement
        total_displacement = 0
        for i in range(1, len(history)):
            dx = history[i][0] - history[i - 1][0]
            dy = history[i][1] - history[i - 1][1]
            total_displacement += np.sqrt(dx * dx + dy * dy)

        # Walking threshold (normalized coordinates, so small values)
        return total_displacement > 0.05

    @staticmethod
    def update_person_action(
        db,
        person_id: int,
        action: ActionType,
        confidence: float,
        camera_id: str,
        zone: str
    ) -> Optional['PersonAction']:
        """
        Update action tracking for a person.

        Creates a new action record if the action changed.
        """
        from models import PersonAction

        now = datetime.utcnow()
        current = ActionService._current_actions.get(person_id)

        # If same action, don't create new record
        if current and current[0] == action:
            return None

        # End previous action
        if current:
            prev_action, started_at = current
            duration = (now - started_at).total_seconds()

            # Update previous action record
            prev_record = db.query(PersonAction).filter(
                PersonAction.person_id == person_id,
                PersonAction.ended_at.is_(None)
            ).first()

            if prev_record:
                prev_record.ended_at = now
                prev_record.duration_seconds = duration

        # Start new action
        ActionService._current_actions[person_id] = (action, now)

        # Create new action record
        new_action = PersonAction(
            person_id=person_id,
            action=action.value,
            confidence=confidence,
            camera_id=camera_id,
            zone=zone,
            started_at=now
        )
        db.add(new_action)
        db.commit()

        return new_action

    @staticmethod
    def get_action_stats(db, hours: int = 24) -> Dict:
        """Get action statistics for time period."""
        from models import PersonAction
        from sqlalchemy import func

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Total time per action type
        stats = db.query(
            PersonAction.action,
            func.count(PersonAction.id).label('count'),
            func.sum(PersonAction.duration_seconds).label('total_seconds')
        ).filter(
            PersonAction.started_at >= cutoff,
            PersonAction.duration_seconds.isnot(None)
        ).group_by(PersonAction.action).all()

        result = {
            "period_hours": hours,
            "actions": {}
        }

        total_time = 0
        for action, count, total_secs in stats:
            total_secs = total_secs or 0
            total_time += total_secs
            result["actions"][action] = {
                "count": count,
                "total_minutes": round(total_secs / 60, 1),
                "avg_duration_seconds": round(total_secs / count, 1) if count > 0 else 0
            }

        # Calculate percentages
        if total_time > 0:
            for action in result["actions"]:
                pct = (result["actions"][action]["total_minutes"] * 60 / total_time) * 100
                result["actions"][action]["percentage"] = round(pct, 1)

        return result

    @staticmethod
    def get_zone_actions(db, hours: int = 24) -> Dict:
        """Get action breakdown by zone."""
        from models import PersonAction
        from sqlalchemy import func

        cutoff = datetime.utcnow() - timedelta(hours=hours)

        stats = db.query(
            PersonAction.zone,
            PersonAction.action,
            func.count(PersonAction.id).label('count'),
            func.sum(PersonAction.duration_seconds).label('total_seconds')
        ).filter(
            PersonAction.started_at >= cutoff,
            PersonAction.duration_seconds.isnot(None),
            PersonAction.zone.isnot(None)
        ).group_by(PersonAction.zone, PersonAction.action).all()

        result = {}
        for zone, action, count, total_secs in stats:
            if zone not in result:
                result[zone] = {}
            result[zone][action] = {
                "count": count,
                "total_minutes": round((total_secs or 0) / 60, 1)
            }

        return result

    @staticmethod
    def get_person_actions(db, person_id: int, hours: int = 24) -> List[Dict]:
        """Get action history for a specific person."""
        from models import PersonAction

        cutoff = datetime.utcnow() - timedelta(hours=hours)
        actions = db.query(PersonAction).filter(
            PersonAction.person_id == person_id,
            PersonAction.started_at >= cutoff
        ).order_by(PersonAction.started_at.desc()).all()

        return [{
            "id": a.id,
            "action": a.action,
            "zone": a.zone,
            "camera_id": a.camera_id,
            "confidence": a.confidence,
            "started_at": a.started_at.isoformat(),
            "ended_at": a.ended_at.isoformat() if a.ended_at else None,
            "duration_seconds": a.duration_seconds,
        } for a in actions]

    @staticmethod
    def cleanup_stale_tracking():
        """Clean up old position tracking data."""
        cutoff = datetime.utcnow() - timedelta(minutes=5)

        # Clean position history
        stale_persons = [
            pid for pid, history in ActionService._person_positions.items()
            if not history or history[-1][2] < cutoff
        ]
        for pid in stale_persons:
            del ActionService._person_positions[pid]

        # Clean current actions for inactive persons
        stale_actions = [
            pid for pid, (_, started) in ActionService._current_actions.items()
            if (datetime.utcnow() - started).total_seconds() > 300
        ]
        for pid in stale_actions:
            del ActionService._current_actions[pid]

        if stale_persons or stale_actions:
            logger.debug(f"Cleaned up {len(stale_persons)} position histories, {len(stale_actions)} stale actions")

    @staticmethod
    def get_current_actions() -> Dict[str, Dict]:
        """Get currently detected actions for all active persons."""
        return {
            str(pid): {"action": action.value, "since": started.isoformat()}
            for pid, (action, started) in ActionService._current_actions.items()
        }
