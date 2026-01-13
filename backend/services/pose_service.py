"""
Pose Estimation Service - Detect seated vs standing using MediaPipe.

Uses MediaPipe Pose to classify detected people as:
- seated: Person is sitting (useful for table occupancy)
- standing: Person is upright (useful for queue detection)
- unknown: Unable to determine pose
"""

import logging
from typing import Optional, Tuple
from enum import Enum
from io import BytesIO

import numpy as np

logger = logging.getLogger(__name__)


class PoseState(Enum):
    SEATED = "seated"
    STANDING = "standing"
    UNKNOWN = "unknown"


class PoseService:
    """Service for pose estimation using MediaPipe."""

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if PoseService._initialized:
            return

        self.pose = None
        self.mp_pose = None
        self._model_loaded = False
        PoseService._initialized = True

    def initialize(self) -> bool:
        """Initialize MediaPipe Pose model."""
        if self._model_loaded:
            return True

        try:
            import mediapipe as mp

            self.mp_pose = mp.solutions.pose
            self.pose = self.mp_pose.Pose(
                static_image_mode=True,
                model_complexity=0,  # 0=lite, 1=full, 2=heavy - use lite for speed
                enable_segmentation=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )

            self._model_loaded = True
            logger.info("MediaPipe Pose model initialized (lite mode)")
            return True

        except ImportError:
            logger.error("MediaPipe not installed. Run: pip install mediapipe")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize MediaPipe Pose: {e}")
            return False

    def detect_pose(self, image_bytes: bytes) -> Tuple[PoseState, float]:
        """
        Detect pose from image bytes.

        Args:
            image_bytes: JPEG image bytes

        Returns:
            Tuple of (PoseState, confidence)
        """
        if not self._model_loaded:
            if not self.initialize():
                return PoseState.UNKNOWN, 0.0

        img = None
        input_buffer = None

        try:
            from PIL import Image
            import cv2

            # Load image
            input_buffer = BytesIO(image_bytes)
            img = Image.open(input_buffer).convert('RGB')
            img_array = np.array(img)

            # Convert RGB to BGR for MediaPipe
            img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

            # Run pose detection
            results = self.pose.process(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))

            if not results.pose_landmarks:
                return PoseState.UNKNOWN, 0.0

            # Analyze pose to determine seated vs standing
            pose_state, confidence = self._classify_pose(results.pose_landmarks)

            return pose_state, confidence

        except Exception as e:
            logger.error(f"Error detecting pose: {e}")
            return PoseState.UNKNOWN, 0.0
        finally:
            if img is not None:
                try:
                    img.close()
                except:
                    pass
            if input_buffer is not None:
                try:
                    input_buffer.close()
                except:
                    pass

    def _classify_pose(self, landmarks) -> Tuple[PoseState, float]:
        """
        Classify pose as seated or standing based on landmark positions.

        Key landmarks:
        - 11, 12: Left/Right shoulder
        - 23, 24: Left/Right hip
        - 25, 26: Left/Right knee
        - 27, 28: Left/Right ankle

        Heuristic:
        - Standing: Hip-knee-ankle roughly vertical, hips above knees
        - Seated: Knees bent at ~90°, hips and knees at similar height
        """
        try:
            # Get key landmarks
            left_hip = landmarks.landmark[23]
            right_hip = landmarks.landmark[24]
            left_knee = landmarks.landmark[25]
            right_knee = landmarks.landmark[26]
            left_ankle = landmarks.landmark[27]
            right_ankle = landmarks.landmark[28]

            # Calculate average positions
            hip_y = (left_hip.y + right_hip.y) / 2
            knee_y = (left_knee.y + right_knee.y) / 2
            ankle_y = (left_ankle.y + right_ankle.y) / 2

            # Visibility confidence
            hip_conf = (left_hip.visibility + right_hip.visibility) / 2
            knee_conf = (left_knee.visibility + right_knee.visibility) / 2

            # If landmarks not visible enough, can't determine
            if hip_conf < 0.3 or knee_conf < 0.3:
                return PoseState.UNKNOWN, min(hip_conf, knee_conf)

            # Calculate ratios (in normalized coordinates, y increases downward)
            hip_to_knee = knee_y - hip_y  # Positive = knee below hip
            knee_to_ankle = ankle_y - knee_y  # Positive = ankle below knee

            # Seated detection heuristics:
            # 1. Hip-to-knee distance is small (legs bent)
            # 2. Hip and knee are at similar vertical positions
            # 3. Knee angle is closer to 90° than 180°

            hip_knee_ratio = hip_to_knee / (knee_to_ankle + 0.001)

            # Standing: hip-to-knee and knee-to-ankle are similar (straight leg)
            # Seated: hip-to-knee is much smaller (bent leg)

            if hip_to_knee < 0.1:
                # Hips and knees at similar height = seated
                confidence = min(hip_conf, knee_conf) * 0.9
                return PoseState.SEATED, confidence

            if hip_knee_ratio > 0.5 and hip_to_knee > 0.15:
                # Good vertical separation with proper ratio = standing
                confidence = min(hip_conf, knee_conf) * 0.9
                return PoseState.STANDING, confidence

            if hip_knee_ratio < 0.3:
                # Very small hip-to-knee relative to knee-to-ankle = seated
                confidence = min(hip_conf, knee_conf) * 0.8
                return PoseState.SEATED, confidence

            # Ambiguous - use average confidence
            return PoseState.UNKNOWN, min(hip_conf, knee_conf) * 0.5

        except Exception as e:
            logger.error(f"Error classifying pose: {e}")
            return PoseState.UNKNOWN, 0.0

    def get_pose_summary(self, landmarks) -> dict:
        """
        Get detailed pose summary for debugging.

        Returns dict with landmark positions and calculated metrics.
        """
        try:
            summary = {
                "left_hip_y": landmarks.landmark[23].y,
                "right_hip_y": landmarks.landmark[24].y,
                "left_knee_y": landmarks.landmark[25].y,
                "right_knee_y": landmarks.landmark[26].y,
                "left_ankle_y": landmarks.landmark[27].y,
                "right_ankle_y": landmarks.landmark[28].y,
                "hip_visibility": (landmarks.landmark[23].visibility + landmarks.landmark[24].visibility) / 2,
                "knee_visibility": (landmarks.landmark[25].visibility + landmarks.landmark[26].visibility) / 2,
            }

            # Calculate derived metrics
            summary["avg_hip_y"] = (summary["left_hip_y"] + summary["right_hip_y"]) / 2
            summary["avg_knee_y"] = (summary["left_knee_y"] + summary["right_knee_y"]) / 2
            summary["hip_to_knee"] = summary["avg_knee_y"] - summary["avg_hip_y"]

            return summary
        except Exception as e:
            logger.error(f"Error getting pose summary: {e}")
            return {}


# Singleton instance
_pose_service: Optional[PoseService] = None


def get_pose_service() -> PoseService:
    """Get or create the pose service singleton."""
    global _pose_service
    if _pose_service is None:
        _pose_service = PoseService()
    return _pose_service
