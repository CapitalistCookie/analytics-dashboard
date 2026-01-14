"""
Anomaly Detection Service for real-time security alerts.

Detects suspicious patterns:
- Loitering: Person in zone longer than threshold
- Restricted Area: Non-staff in staff-only zones
- Unusual Hours: Activity in closed areas after hours
- Crowd Density: Too many people in one zone
- Rapid Exit: Person leaves very quickly (potential theft)
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class AnomalyType(str, Enum):
    LOITERING = "loitering"
    RESTRICTED_AREA = "restricted_area"
    UNUSUAL_HOURS = "unusual_hours"
    CROWD_DENSITY = "crowd_density"
    RAPID_EXIT = "rapid_exit"


class AnomalySeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Configuration - can be updated via API
ANOMALY_CONFIG = {
    "loitering": {
        "enabled": True,
        "thresholds": {
            "entrance": 300,      # 5 min at entrance = suspicious
            "cashier": 600,       # 10 min at cashier
            "hallway": 180,       # 3 min in hallway
            "back_hallway": 180,  # 3 min in back hallway
            "default": 1800,      # 30 min anywhere else
        },
        "severity": "medium",
        "cooldown": 300,  # Don't re-alert for 5 min
    },
    "restricted_area": {
        "enabled": True,
        "zones": ["kitchen", "storage", "office", "back_hallway"],
        "severity": "high",
        "cooldown": 60,
    },
    "unusual_hours": {
        "enabled": True,
        "closed_start": 23,  # 11 PM
        "closed_end": 6,     # 6 AM
        "zones": ["kitchen", "storage", "office"],
        "severity": "high",
        "cooldown": 300,
    },
    "crowd_density": {
        "enabled": True,
        "thresholds": {
            "entrance": 10,
            "cashier": 8,
            "seating": 50,
            "bar": 20,
            "default": 15,
        },
        "severity": "medium",
        "cooldown": 120,
    },
    "rapid_exit": {
        "enabled": True,
        "max_duration_seconds": 60,  # Left within 1 min
        "severity": "medium",
        "cooldown": 0,  # Always alert
    },
}

# Track recent alerts to prevent spam
_recent_alerts: Dict[str, datetime] = {}


class AnomalyService:
    """Service for detecting and managing anomalies."""

    @staticmethod
    def check_loitering(
        person_id: int,
        display_id: str,
        zone: str,
        dwell_seconds: float,
        is_staff: bool
    ) -> Optional[Dict]:
        """Check if person has been in zone too long."""
        config = ANOMALY_CONFIG["loitering"]
        if not config.get("enabled", True):
            return None

        if is_staff:
            return None  # Staff can stay anywhere

        threshold = config["thresholds"].get(zone, config["thresholds"]["default"])

        if dwell_seconds < threshold:
            return None

        alert_key = f"loitering:{person_id}:{zone}"
        if not AnomalyService._check_cooldown(alert_key, config["cooldown"]):
            return None

        return {
            "type": AnomalyType.LOITERING.value,
            "severity": config["severity"],
            "person_id": person_id,
            "display_id": display_id,
            "zone": zone,
            "details": {
                "dwell_seconds": int(dwell_seconds),
                "threshold": threshold,
            },
            "message": f"Person {display_id} loitering in {zone} for {int(dwell_seconds/60)} minutes",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def check_restricted_area(
        person_id: int,
        display_id: str,
        zone: str,
        camera_id: str,
        is_staff: bool
    ) -> Optional[Dict]:
        """Check if non-staff entered restricted area."""
        config = ANOMALY_CONFIG["restricted_area"]
        if not config.get("enabled", True):
            return None

        if is_staff:
            return None

        if zone not in config["zones"]:
            return None

        alert_key = f"restricted:{person_id}:{zone}"
        if not AnomalyService._check_cooldown(alert_key, config["cooldown"]):
            return None

        return {
            "type": AnomalyType.RESTRICTED_AREA.value,
            "severity": config["severity"],
            "person_id": person_id,
            "display_id": display_id,
            "zone": zone,
            "camera_id": camera_id,
            "message": f"Non-staff {display_id} entered restricted area: {zone}",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def check_unusual_hours(zone: str, camera_id: str) -> Optional[Dict]:
        """Check for activity during closed hours."""
        config = ANOMALY_CONFIG["unusual_hours"]
        if not config.get("enabled", True):
            return None

        current_hour = datetime.now().hour

        is_closed = (current_hour >= config["closed_start"] or
                     current_hour < config["closed_end"])

        if not is_closed or zone not in config["zones"]:
            return None

        alert_key = f"unusual_hours:{zone}"
        if not AnomalyService._check_cooldown(alert_key, config["cooldown"]):
            return None

        return {
            "type": AnomalyType.UNUSUAL_HOURS.value,
            "severity": config["severity"],
            "zone": zone,
            "camera_id": camera_id,
            "message": f"Activity detected in {zone} during closed hours",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def check_crowd_density(zone: str, count: int) -> Optional[Dict]:
        """Check if zone is overcrowded."""
        config = ANOMALY_CONFIG["crowd_density"]
        if not config.get("enabled", True):
            return None

        threshold = config["thresholds"].get(zone, config["thresholds"]["default"])

        if count < threshold:
            return None

        alert_key = f"crowd:{zone}"
        if not AnomalyService._check_cooldown(alert_key, config["cooldown"]):
            return None

        return {
            "type": AnomalyType.CROWD_DENSITY.value,
            "severity": config["severity"],
            "zone": zone,
            "details": {
                "count": count,
                "threshold": threshold,
            },
            "message": f"High crowd density in {zone}: {count} people (threshold: {threshold})",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def check_rapid_exit(
        person_id: int,
        display_id: str,
        total_duration_seconds: float
    ) -> Optional[Dict]:
        """Check if person left unusually quickly."""
        config = ANOMALY_CONFIG["rapid_exit"]
        if not config.get("enabled", True):
            return None

        if total_duration_seconds > config["max_duration_seconds"]:
            return None

        # Skip very short durations (likely false detections)
        if total_duration_seconds < 5:
            return None

        return {
            "type": AnomalyType.RAPID_EXIT.value,
            "severity": config["severity"],
            "person_id": person_id,
            "display_id": display_id,
            "details": {
                "duration_seconds": int(total_duration_seconds),
            },
            "message": f"Person {display_id} exited rapidly after {int(total_duration_seconds)} seconds",
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def _check_cooldown(alert_key: str, cooldown_seconds: int) -> bool:
        """Check if enough time passed since last alert. Returns True if can alert."""
        now = datetime.utcnow()
        last_alert = _recent_alerts.get(alert_key)

        if last_alert and (now - last_alert).total_seconds() < cooldown_seconds:
            return False

        _recent_alerts[alert_key] = now
        return True

    @staticmethod
    def cleanup_old_alerts():
        """Remove old alert cooldowns to prevent memory leak."""
        now = datetime.utcnow()
        max_age = timedelta(hours=1)
        old_keys = [k for k, v in _recent_alerts.items() if now - v > max_age]
        for k in old_keys:
            del _recent_alerts[k]
        if old_keys:
            logger.debug(f"Cleaned up {len(old_keys)} old alert cooldowns")

    @staticmethod
    def get_config() -> Dict:
        """Get current anomaly configuration."""
        return ANOMALY_CONFIG.copy()

    @staticmethod
    def update_config(anomaly_type: str, updates: Dict) -> Dict:
        """Update configuration for specific anomaly type."""
        if anomaly_type not in ANOMALY_CONFIG:
            raise ValueError(f"Unknown anomaly type: {anomaly_type}")
        ANOMALY_CONFIG[anomaly_type].update(updates)
        return ANOMALY_CONFIG[anomaly_type]
