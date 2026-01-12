"""Detection configuration endpoints for tuning Frigate settings."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from frigate_config_service import frigate_config_service

router = APIRouter(prefix="/api/detection", tags=["detection"])


# Pydantic models
class DetectSettings(BaseModel):
    enabled: Optional[bool] = None
    min_area: Optional[int] = Field(None, ge=100, le=50000)
    max_area: Optional[int] = Field(None, ge=1000, le=500000)
    threshold: Optional[float] = Field(None, ge=0.1, le=1.0)
    min_score: Optional[float] = Field(None, ge=0.1, le=1.0)
    max_disappeared: Optional[int] = Field(None, ge=10, le=500)


class MotionSettings(BaseModel):
    threshold: Optional[int] = Field(None, ge=1, le=100)
    contour_area: Optional[int] = Field(None, ge=10, le=1000)
    improve_contrast: Optional[bool] = None
    frame_alpha: Optional[float] = Field(None, ge=0.01, le=0.5)


class StationarySettings(BaseModel):
    interval: Optional[int] = Field(None, ge=0, le=200)
    threshold: Optional[int] = Field(None, ge=0, le=200)


class CameraDetectionSettingsUpdate(BaseModel):
    detect: Optional[DetectSettings] = None
    motion: Optional[MotionSettings] = None
    stationary: Optional[StationarySettings] = None


class CameraDetectionSettings(BaseModel):
    camera_id: str
    enabled: bool
    detect: dict
    motion: dict
    stationary: dict
    zones: list[str]


class AllDetectionSettings(BaseModel):
    cameras: dict[str, CameraDetectionSettings]
    global_settings: dict = Field(alias="global")


class PresetInfo(BaseModel):
    name: str
    description: str


class CustomPresetCreate(BaseModel):
    name: str
    description: str
    detect: Optional[DetectSettings] = None
    motion: Optional[MotionSettings] = None
    stationary: Optional[StationarySettings] = None


class ConfigHistoryEntry(BaseModel):
    id: str
    timestamp: str
    reason: str


class ApplyPresetRequest(BaseModel):
    preset_name: str


class ApplyPresetToGroupRequest(BaseModel):
    group_name: str
    preset_name: str


@router.get("/config")
async def get_all_detection_config():
    """Get detection settings for all cameras."""
    try:
        settings = frigate_config_service.get_all_detection_settings()
        return settings
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/{camera_id}")
async def get_camera_detection_config(camera_id: str):
    """Get detection settings for a specific camera."""
    try:
        settings = frigate_config_service.get_camera_detection_settings(camera_id)
        return settings
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/{camera_id}")
async def update_camera_detection_config(
    camera_id: str,
    settings: CameraDetectionSettingsUpdate,
):
    """Update detection settings for a specific camera."""
    try:
        # Convert Pydantic model to dict, excluding None values
        settings_dict = {}
        if settings.detect:
            settings_dict["detect"] = settings.detect.model_dump(exclude_none=True)
        if settings.motion:
            settings_dict["motion"] = settings.motion.model_dump(exclude_none=True)
        if settings.stationary:
            settings_dict["stationary"] = settings.stationary.model_dump(exclude_none=True)

        result = frigate_config_service.update_camera_detection_settings(
            camera_id,
            settings_dict,
            f"Updated via API",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reload")
async def reload_frigate_config():
    """Trigger Frigate to reload its configuration."""
    result = await frigate_config_service.reload_frigate_config()
    if not result.get("success"):
        raise HTTPException(status_code=503, detail=result.get("message"))
    return result


@router.get("/presets")
async def get_presets():
    """Get all available detection presets."""
    return frigate_config_service.get_presets()


@router.post("/presets/{camera_id}/apply")
async def apply_preset_to_camera(camera_id: str, request: ApplyPresetRequest):
    """Apply a preset configuration to a specific camera."""
    try:
        result = frigate_config_service.apply_preset(camera_id, request.preset_name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/presets/apply-all")
async def apply_preset_to_all_cameras(request: ApplyPresetRequest):
    """Apply a preset configuration to all cameras."""
    try:
        result = frigate_config_service.apply_preset_to_all(request.preset_name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/presets/apply-group")
async def apply_preset_to_camera_group(request: ApplyPresetToGroupRequest):
    """Apply a preset configuration to a camera group."""
    try:
        result = frigate_config_service.apply_preset_to_group(
            request.group_name,
            request.preset_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/presets/custom")
async def create_custom_preset(preset: CustomPresetCreate):
    """Save current settings as a custom preset."""
    try:
        settings = {}
        if preset.detect:
            settings["detect"] = preset.detect.model_dump(exclude_none=True)
        if preset.motion:
            settings["motion"] = preset.motion.model_dump(exclude_none=True)
        if preset.stationary:
            settings["stationary"] = preset.stationary.model_dump(exclude_none=True)

        result = frigate_config_service.save_custom_preset(
            preset.name,
            preset.description,
            settings,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/presets/custom/{preset_name}")
async def delete_custom_preset(preset_name: str):
    """Delete a custom preset."""
    success = frigate_config_service.delete_custom_preset(preset_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found")
    return {"success": True, "message": f"Preset '{preset_name}' deleted"}


@router.get("/config/history")
async def get_config_history(limit: int = 20):
    """Get recent configuration change history."""
    return frigate_config_service.get_config_history(limit)


@router.post("/config/restore/{history_id}")
async def restore_config_from_history(history_id: str):
    """Restore configuration from a history snapshot."""
    try:
        result = frigate_config_service.restore_config(history_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/stats/{camera_id}")
async def get_camera_detection_stats(camera_id: str):
    """Get current detection statistics for a camera."""
    return await frigate_config_service.get_camera_stats(camera_id)


@router.get("/camera-groups")
async def get_camera_groups():
    """Get camera group definitions."""
    return frigate_config_service.CAMERA_GROUPS
