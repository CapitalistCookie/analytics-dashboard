"""Frigate service for face recognition and training.

In Frigate 0.16+, faces are registered by placing images in the faces directory.
The directory structure is: /media/frigate/clips/faces/{name}/
Frigate auto-indexes faces when images are added to or removed from this directory.
"""

import os
import shutil
import uuid
from typing import Optional
import httpx

FRIGATE_URL = os.getenv("FRIGATE_URL", "http://localhost:5000")
# Path to Frigate's faces directory - mounted from Frigate container
FRIGATE_FACES_PATH = os.getenv("FRIGATE_FACES_PATH", "/frigate/clips/faces")


class FrigateService:
    """Service for interacting with Frigate's face recognition.

    In Frigate 0.16+, face registration is done via the file system rather than API.
    Faces are stored in: {FRIGATE_FACES_PATH}/{name}/{image_id}.jpg
    """

    def __init__(self, base_url: str = FRIGATE_URL, faces_path: str = FRIGATE_FACES_PATH):
        self.base_url = base_url
        self.faces_path = faces_path

    def _ensure_faces_dir(self, name: str) -> str:
        """Ensure the faces directory exists for a person and return the path."""
        person_dir = os.path.join(self.faces_path, name)
        os.makedirs(person_dir, exist_ok=True)
        return person_dir

    async def upload_face(self, name: str, image_data: bytes, image_id: Optional[str] = None) -> dict:
        """
        Upload a face image to Frigate for a person.

        Args:
            name: The person's name (used as face ID, should be lowercase with underscores)
            image_data: The image file bytes
            image_id: Optional unique ID for this image (auto-generated if not provided)

        Returns:
            Dictionary with success status and image filename
        """
        person_dir = self._ensure_faces_dir(name)

        # Generate unique filename
        if not image_id:
            image_id = f"face_{uuid.uuid4().hex[:8]}"
        filename = f"{image_id}.jpg"
        filepath = os.path.join(person_dir, filename)

        # Write the image file
        with open(filepath, "wb") as f:
            f.write(image_data)

        return {
            "success": True,
            "name": name,
            "filename": filename,
            "path": filepath,
            "message": f"Face image uploaded for {name}"
        }

    async def delete_face(self, name: str, face_id: Optional[str] = None) -> dict:
        """
        Delete a face or specific face image from Frigate.

        Args:
            name: The person's name
            face_id: Optional specific face image ID to delete (without extension)

        Returns:
            Dictionary with success status
        """
        person_dir = os.path.join(self.faces_path, name)

        if not os.path.exists(person_dir):
            return {"success": True, "message": f"Face {name} not found (already deleted)"}

        if face_id:
            # Delete specific face image
            filepath = os.path.join(person_dir, f"{face_id}.jpg")
            if os.path.exists(filepath):
                os.remove(filepath)

            # Check if directory is empty after deletion
            if not os.listdir(person_dir):
                os.rmdir(person_dir)

            return {"success": True, "message": f"Face image {face_id} deleted for {name}"}
        else:
            # Delete all faces for this person
            shutil.rmtree(person_dir)
            return {"success": True, "message": f"All faces deleted for {name}"}

    async def train_face(self, name: str) -> dict:
        """
        In Frigate 0.16+, training is automatic when images are added.
        This method verifies the face exists and returns status.

        Args:
            name: The person's name to train

        Returns:
            Dictionary with training status
        """
        person_dir = os.path.join(self.faces_path, name)

        if not os.path.exists(person_dir):
            raise FileNotFoundError(f"No face directory found for {name}")

        # Count face images
        images = [f for f in os.listdir(person_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]

        if not images:
            raise FileNotFoundError(f"No face images found for {name}")

        return {
            "success": True,
            "name": name,
            "images_count": len(images),
            "message": f"Face registered for {name} with {len(images)} image(s). Frigate will auto-index."
        }

    async def get_faces(self) -> dict:
        """
        Get list of all registered faces.

        Returns:
            Dictionary of face names and their images
        """
        # First try the API (works for reading)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/faces")
                if response.status_code == 200:
                    return response.json()
        except Exception:
            pass

        # Fallback to file system
        if not os.path.exists(self.faces_path):
            return {}

        faces = {}
        for name in os.listdir(self.faces_path):
            person_dir = os.path.join(self.faces_path, name)
            if os.path.isdir(person_dir):
                images = [f for f in os.listdir(person_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
                if images:
                    faces[name] = images

        return faces

    async def get_face(self, name: str) -> dict:
        """
        Get details for a specific face.

        Args:
            name: The person's name

        Returns:
            Face details including image IDs
        """
        person_dir = os.path.join(self.faces_path, name)

        if not os.path.exists(person_dir):
            raise FileNotFoundError(f"Face not found: {name}")

        images = [f for f in os.listdir(person_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]

        return {
            "name": name,
            "images": images,
            "count": len(images)
        }

    async def get_training_status(self) -> dict:
        """
        Get the current face training status.
        In Frigate 0.16+, training is automatic, so this just returns registered faces count.

        Returns:
            Training status information
        """
        faces = await self.get_faces()
        total_images = sum(len(images) for images in faces.values())

        return {
            "status": "ready",
            "registered_faces": len(faces),
            "total_images": total_images,
            "message": "Face recognition is automatic in Frigate 0.16+"
        }

    async def reindex_faces(self) -> dict:
        """
        Trigger reindexing of all faces via API.

        Returns:
            Response from Frigate API
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{self.base_url}/api/faces/reindex")
                if response.status_code == 200:
                    return response.json()
                # If API fails, faces will auto-index eventually
                return {"success": True, "message": "Reindex requested (may be automatic in this version)"}
        except Exception:
            return {"success": True, "message": "Auto-indexing will occur on next detection"}


# Singleton instance
frigate_service = FrigateService()
