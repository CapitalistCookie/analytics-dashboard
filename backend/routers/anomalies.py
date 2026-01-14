"""Anomalies router for anomaly detection configuration and alerts."""

from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.anomaly_service import (
    ANOMALY_CONFIG,
    AnomalyType,
    AnomalySeverity,
    AnomalyService,
)

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


class AnomalyTypeInfo(BaseModel):
    """Anomaly type information."""
    type: str
    description: str


class AnomalyConfigUpdate(BaseModel):
    """Update anomaly configuration."""
    enabled: bool = None
    severity: str = None
    cooldown: int = None
    thresholds: Dict[str, int] = None
    zones: List[str] = None
    closed_start: int = None
    closed_end: int = None
    max_duration_seconds: int = None


@router.get("/config")
async def get_anomaly_config() -> Dict:
    """Get current anomaly detection configuration."""
    return AnomalyService.get_config()


@router.get("/types")
async def get_anomaly_types() -> List[AnomalyTypeInfo]:
    """Get list of anomaly types with descriptions."""
    descriptions = {
        AnomalyType.LOITERING: "Person in zone longer than threshold",
        AnomalyType.RESTRICTED_AREA: "Non-staff in staff-only zones",
        AnomalyType.UNUSUAL_HOURS: "Activity in closed areas after hours",
        AnomalyType.CROWD_DENSITY: "Too many people in one zone",
        AnomalyType.RAPID_EXIT: "Person leaves very quickly",
    }
    return [
        AnomalyTypeInfo(type=t.value, description=descriptions.get(t, t.name))
        for t in AnomalyType
    ]


@router.get("/config/{anomaly_type}")
async def get_anomaly_type_config(anomaly_type: str) -> Dict:
    """Get configuration for specific anomaly type."""
    if anomaly_type not in ANOMALY_CONFIG:
        raise HTTPException(404, f"Unknown anomaly type: {anomaly_type}")
    return ANOMALY_CONFIG[anomaly_type]


@router.put("/config/{anomaly_type}")
async def update_anomaly_config(anomaly_type: str, config: AnomalyConfigUpdate) -> Dict:
    """
    Update configuration for specific anomaly type.

    Only provided fields will be updated.
    """
    if anomaly_type not in ANOMALY_CONFIG:
        raise HTTPException(404, f"Unknown anomaly type: {anomaly_type}")

    updates = {k: v for k, v in config.model_dump().items() if v is not None}

    if not updates:
        return {"status": "no_changes", "config": ANOMALY_CONFIG[anomaly_type]}

    try:
        updated = AnomalyService.update_config(anomaly_type, updates)
        return {"status": "updated", "config": updated}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/config/{anomaly_type}/enable")
async def enable_anomaly_type(anomaly_type: str) -> Dict:
    """Enable specific anomaly type."""
    if anomaly_type not in ANOMALY_CONFIG:
        raise HTTPException(404, f"Unknown anomaly type: {anomaly_type}")

    ANOMALY_CONFIG[anomaly_type]["enabled"] = True
    return {"status": "enabled", "anomaly_type": anomaly_type}


@router.post("/config/{anomaly_type}/disable")
async def disable_anomaly_type(anomaly_type: str) -> Dict:
    """Disable specific anomaly type."""
    if anomaly_type not in ANOMALY_CONFIG:
        raise HTTPException(404, f"Unknown anomaly type: {anomaly_type}")

    ANOMALY_CONFIG[anomaly_type]["enabled"] = False
    return {"status": "disabled", "anomaly_type": anomaly_type}
