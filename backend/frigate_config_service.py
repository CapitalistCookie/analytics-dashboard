"""Frigate configuration service for detection tuning.

Reads and writes Frigate's config.yml to allow adjusting detection settings
without SSH access. Supports per-camera settings and presets.
"""

import os
import copy
import json
import shutil
from datetime import datetime
from typing import Optional, Any
from pathlib import Path

import yaml
import httpx

FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")
FRIGATE_CONFIG_PATH = os.getenv("FRIGATE_CONFIG_PATH", "/frigate/config/config.yml")
CONFIG_HISTORY_PATH = os.getenv("CONFIG_HISTORY_PATH", "/app/data/config_history")


class FrigateConfigService:
    """Service for managing Frigate detection configuration."""

    # Default detection settings (Frigate defaults)
    DEFAULT_DETECTION = {
        "enabled": True,
        "min_area": 2500,
        "max_area": 100000,
        "threshold": 0.7,
        "min_score": 0.5,
        "max_disappeared": 75,
    }

    DEFAULT_STATIONARY = {
        "interval": 50,
        "threshold": 50,
        "max_frames": {"default": None, "objects": {}},
    }

    DEFAULT_MOTION = {
        "threshold": 25,
        "contour_area": 100,
        "improve_contrast": True,
        "frame_alpha": 0.02,
        "frame_height": 100,
    }

    # Preset configurations
    PRESETS = {
        "high_sensitivity": {
            "name": "High Sensitivity",
            "description": "Lower thresholds to catch more detections (may increase false positives)",
            "detect": {
                "min_area": 1500,
                "threshold": 0.5,
                "min_score": 0.4,
                "max_disappeared": 100,
            },
            "motion": {
                "threshold": 15,
                "contour_area": 50,
            },
        },
        "balanced": {
            "name": "Balanced",
            "description": "Default balanced settings",
            "detect": {
                "min_area": 2500,
                "threshold": 0.7,
                "min_score": 0.5,
                "max_disappeared": 75,
            },
            "motion": {
                "threshold": 25,
                "contour_area": 100,
            },
        },
        "low_sensitivity": {
            "name": "Low Sensitivity",
            "description": "Higher thresholds to reduce false positives (may miss some detections)",
            "detect": {
                "min_area": 5000,
                "threshold": 0.8,
                "min_score": 0.6,
                "max_disappeared": 50,
            },
            "motion": {
                "threshold": 35,
                "contour_area": 200,
            },
        },
        "stationary_focus": {
            "name": "Stationary Focus",
            "description": "Optimized for detecting seated/stationary people",
            "detect": {
                "min_area": 2000,
                "threshold": 0.65,
                "min_score": 0.5,
                "max_disappeared": 150,
            },
            "stationary": {
                "interval": 30,
                "threshold": 30,
            },
            "motion": {
                "threshold": 20,
                "contour_area": 75,
            },
        },
        "entrance_counting": {
            "name": "Entrance Counting",
            "description": "Optimized for counting people at doorways",
            "detect": {
                "min_area": 3000,
                "threshold": 0.75,
                "min_score": 0.55,
                "max_disappeared": 40,
            },
            "motion": {
                "threshold": 20,
                "contour_area": 100,
            },
        },
    }

    # Camera group presets
    CAMERA_GROUPS = {
        "seating": ["cam_192", "cam_179", "cam_028"],
        "entrance": ["cam_009"],
        "kitchen": ["cam_108", "cam_239"],
        "cashier": ["cam_040"],
        "hallway": ["cam_054"],
    }

    def __init__(
        self,
        config_path: str = FRIGATE_CONFIG_PATH,
        history_path: str = CONFIG_HISTORY_PATH,
        frigate_url: str = FRIGATE_URL,
    ):
        self.config_path = config_path
        self.history_path = Path(history_path)
        self.frigate_url = frigate_url
        self._ensure_history_dir()

    def _ensure_history_dir(self):
        """Ensure the history directory exists."""
        self.history_path.mkdir(parents=True, exist_ok=True)

    def _read_config(self) -> dict:
        """Read the Frigate config file."""
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Frigate config not found at {self.config_path}")

        with open(self.config_path, "r") as f:
            return yaml.safe_load(f)

    def _write_config(self, config: dict, reason: str = "Manual update"):
        """Write the config file and save to history."""
        # Backup current config to history
        self._save_history(reason)

        # Write new config
        with open(self.config_path, "w") as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    def _save_history(self, reason: str):
        """Save current config to history."""
        if not os.path.exists(self.config_path):
            return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        history_file = self.history_path / f"config_{timestamp}.yml"

        # Copy current config
        shutil.copy(self.config_path, history_file)

        # Save metadata
        metadata_file = self.history_path / f"config_{timestamp}.json"
        with open(metadata_file, "w") as f:
            json.dump(
                {
                    "timestamp": datetime.now().isoformat(),
                    "reason": reason,
                    "config_file": str(history_file),
                },
                f,
            )

        # Keep only last 50 history entries
        self._cleanup_history(max_entries=50)

    def _cleanup_history(self, max_entries: int = 50):
        """Remove old history entries beyond the max limit."""
        history_files = sorted(self.history_path.glob("config_*.yml"))
        if len(history_files) > max_entries:
            for old_file in history_files[:-max_entries]:
                old_file.unlink()
                # Also remove metadata file
                meta_file = old_file.with_suffix(".json")
                if meta_file.exists():
                    meta_file.unlink()

    def get_all_detection_settings(self) -> dict:
        """Get detection settings for all cameras."""
        config = self._read_config()
        cameras = config.get("cameras", {})
        global_detect = config.get("detect", {})
        global_motion = config.get("motion", {})
        global_stationary = config.get("objects", {}).get("track", ["person"])

        result = {"cameras": {}, "global": {}}

        # Global settings
        result["global"] = {
            "detect": {**self.DEFAULT_DETECTION, **global_detect},
            "motion": {**self.DEFAULT_MOTION, **global_motion},
        }

        # Per-camera settings
        for camera_id, camera_config in cameras.items():
            cam_detect = camera_config.get("detect", {})
            cam_motion = camera_config.get("motion", {})
            cam_stationary = camera_config.get("objects", {}).get("filters", {}).get("person", {}).get("stationary", {})
            cam_zones = camera_config.get("zones", {})

            result["cameras"][camera_id] = {
                "camera_id": camera_id,
                "enabled": cam_detect.get("enabled", True),
                "detect": {
                    **self.DEFAULT_DETECTION,
                    **global_detect,
                    **cam_detect,
                },
                "motion": {
                    **self.DEFAULT_MOTION,
                    **global_motion,
                    **cam_motion,
                },
                "stationary": {
                    **self.DEFAULT_STATIONARY,
                    **cam_stationary,
                },
                "zones": list(cam_zones.keys()),
            }

        return result

    def get_camera_detection_settings(self, camera_id: str) -> dict:
        """Get detection settings for a specific camera."""
        all_settings = self.get_all_detection_settings()
        if camera_id not in all_settings["cameras"]:
            raise ValueError(f"Camera {camera_id} not found in config")
        return all_settings["cameras"][camera_id]

    def update_camera_detection_settings(
        self,
        camera_id: str,
        settings: dict,
        reason: str = "Detection settings update",
    ) -> dict:
        """Update detection settings for a specific camera."""
        config = self._read_config()

        if camera_id not in config.get("cameras", {}):
            raise ValueError(f"Camera {camera_id} not found in config")

        # Validate settings
        self._validate_settings(settings)

        camera_config = config["cameras"][camera_id]

        # Update detect settings
        if "detect" in settings:
            if "detect" not in camera_config:
                camera_config["detect"] = {}
            for key, value in settings["detect"].items():
                if value is not None:
                    camera_config["detect"][key] = value

        # Update motion settings
        if "motion" in settings:
            if "motion" not in camera_config:
                camera_config["motion"] = {}
            for key, value in settings["motion"].items():
                if value is not None:
                    camera_config["motion"][key] = value

        # Update stationary settings
        if "stationary" in settings:
            if "objects" not in camera_config:
                camera_config["objects"] = {}
            if "filters" not in camera_config["objects"]:
                camera_config["objects"]["filters"] = {}
            if "person" not in camera_config["objects"]["filters"]:
                camera_config["objects"]["filters"]["person"] = {}
            camera_config["objects"]["filters"]["person"]["stationary"] = settings["stationary"]

        # Write updated config
        self._write_config(config, f"{reason} for {camera_id}")

        return self.get_camera_detection_settings(camera_id)

    def _validate_settings(self, settings: dict):
        """Validate detection settings ranges."""
        if "detect" in settings:
            detect = settings["detect"]
            if "min_area" in detect and not (100 <= detect["min_area"] <= 50000):
                raise ValueError("min_area must be between 100 and 50000")
            if "max_area" in detect and not (1000 <= detect["max_area"] <= 500000):
                raise ValueError("max_area must be between 1000 and 500000")
            if "threshold" in detect and not (0.1 <= detect["threshold"] <= 1.0):
                raise ValueError("threshold must be between 0.1 and 1.0")
            if "min_score" in detect and not (0.1 <= detect["min_score"] <= 1.0):
                raise ValueError("min_score must be between 0.1 and 1.0")
            if "max_disappeared" in detect and not (10 <= detect["max_disappeared"] <= 500):
                raise ValueError("max_disappeared must be between 10 and 500")

        if "motion" in settings:
            motion = settings["motion"]
            if "threshold" in motion and not (1 <= motion["threshold"] <= 100):
                raise ValueError("motion threshold must be between 1 and 100")
            if "contour_area" in motion and not (10 <= motion["contour_area"] <= 1000):
                raise ValueError("motion contour_area must be between 10 and 1000")

        if "stationary" in settings:
            stationary = settings["stationary"]
            if "interval" in stationary and not (0 <= stationary["interval"] <= 200):
                raise ValueError("stationary interval must be between 0 and 200")
            if "threshold" in stationary and not (0 <= stationary["threshold"] <= 200):
                raise ValueError("stationary threshold must be between 0 and 200")

    def apply_preset(
        self,
        camera_id: str,
        preset_name: str,
        reason: str = None,
    ) -> dict:
        """Apply a preset configuration to a camera."""
        if preset_name not in self.PRESETS:
            raise ValueError(f"Unknown preset: {preset_name}. Available: {list(self.PRESETS.keys())}")

        preset = self.PRESETS[preset_name]
        settings = {}

        if "detect" in preset:
            settings["detect"] = preset["detect"]
        if "motion" in preset:
            settings["motion"] = preset["motion"]
        if "stationary" in preset:
            settings["stationary"] = preset["stationary"]

        if not reason:
            reason = f"Applied preset '{preset_name}'"

        return self.update_camera_detection_settings(camera_id, settings, reason)

    def apply_preset_to_group(
        self,
        group_name: str,
        preset_name: str,
    ) -> dict:
        """Apply a preset to a camera group."""
        if group_name not in self.CAMERA_GROUPS:
            raise ValueError(f"Unknown camera group: {group_name}")

        results = {}
        cameras = self.CAMERA_GROUPS[group_name]

        for camera_id in cameras:
            try:
                results[camera_id] = self.apply_preset(
                    camera_id,
                    preset_name,
                    f"Applied preset '{preset_name}' to group '{group_name}'",
                )
            except ValueError as e:
                results[camera_id] = {"error": str(e)}

        return results

    def apply_preset_to_all(self, preset_name: str) -> dict:
        """Apply a preset to all cameras."""
        settings = self.get_all_detection_settings()
        results = {}

        for camera_id in settings["cameras"]:
            try:
                results[camera_id] = self.apply_preset(
                    camera_id,
                    preset_name,
                    f"Applied preset '{preset_name}' to all cameras",
                )
            except ValueError as e:
                results[camera_id] = {"error": str(e)}

        return results

    def get_presets(self) -> dict:
        """Get all available presets including custom ones."""
        # Load custom presets if they exist
        custom_presets_file = self.history_path / "custom_presets.json"
        custom_presets = {}

        if custom_presets_file.exists():
            with open(custom_presets_file, "r") as f:
                custom_presets = json.load(f)

        return {
            "builtin": self.PRESETS,
            "custom": custom_presets,
            "camera_groups": self.CAMERA_GROUPS,
        }

    def save_custom_preset(
        self,
        name: str,
        description: str,
        settings: dict,
    ) -> dict:
        """Save current camera settings as a custom preset."""
        custom_presets_file = self.history_path / "custom_presets.json"

        # Load existing custom presets
        custom_presets = {}
        if custom_presets_file.exists():
            with open(custom_presets_file, "r") as f:
                custom_presets = json.load(f)

        # Validate settings
        self._validate_settings(settings)

        # Save preset
        preset_key = name.lower().replace(" ", "_")
        custom_presets[preset_key] = {
            "name": name,
            "description": description,
            "created_at": datetime.now().isoformat(),
            **settings,
        }

        with open(custom_presets_file, "w") as f:
            json.dump(custom_presets, f, indent=2)

        return custom_presets[preset_key]

    def delete_custom_preset(self, preset_name: str) -> bool:
        """Delete a custom preset."""
        custom_presets_file = self.history_path / "custom_presets.json"

        if not custom_presets_file.exists():
            return False

        with open(custom_presets_file, "r") as f:
            custom_presets = json.load(f)

        preset_key = preset_name.lower().replace(" ", "_")
        if preset_key not in custom_presets:
            return False

        del custom_presets[preset_key]

        with open(custom_presets_file, "w") as f:
            json.dump(custom_presets, f, indent=2)

        return True

    def get_config_history(self, limit: int = 20) -> list:
        """Get recent config change history."""
        history = []
        metadata_files = sorted(
            self.history_path.glob("config_*.json"),
            reverse=True,
        )[:limit]

        for meta_file in metadata_files:
            with open(meta_file, "r") as f:
                metadata = json.load(f)
                metadata["id"] = meta_file.stem.replace("config_", "")
                history.append(metadata)

        return history

    def restore_config(self, history_id: str) -> dict:
        """Restore config from history."""
        config_file = self.history_path / f"config_{history_id}.yml"

        if not config_file.exists():
            raise FileNotFoundError(f"History config not found: {history_id}")

        # Backup current before restoring
        self._save_history(f"Before restore to {history_id}")

        # Restore the old config
        shutil.copy(config_file, self.config_path)

        return {"restored": history_id, "message": "Config restored successfully"}

    async def reload_frigate_config(self) -> dict:
        """Trigger Frigate to reload its configuration."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(f"{self.frigate_url}/api/restart")
                if response.status_code == 200:
                    return {"success": True, "message": "Frigate restart triggered"}
                return {
                    "success": False,
                    "message": f"Frigate returned status {response.status_code}",
                }
        except httpx.HTTPError as e:
            return {"success": False, "message": f"Failed to contact Frigate: {str(e)}"}

    async def get_camera_stats(self, camera_id: str) -> dict:
        """Get current detection stats for a camera."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.frigate_url}/api/stats")
                if response.status_code == 200:
                    stats = response.json()
                    camera_stats = stats.get("cameras", {}).get(camera_id, {})
                    return {
                        "camera_id": camera_id,
                        "detection_fps": camera_stats.get("detection_fps", 0),
                        "process_fps": camera_stats.get("process_fps", 0),
                        "detection_enabled": camera_stats.get("detection_enabled", True),
                    }
                return {"camera_id": camera_id, "error": "Failed to get stats"}
        except httpx.HTTPError as e:
            return {"camera_id": camera_id, "error": str(e)}


# Singleton instance
frigate_config_service = FrigateConfigService()
