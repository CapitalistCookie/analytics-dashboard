"""
Person Re-Identification Service using OSNet.

This service extracts appearance embeddings from person images and matches
them against known embeddings to maintain consistent person IDs across
camera views and time.
"""

import os
import io
import base64
import logging
from typing import Optional, List, Tuple
from pathlib import Path

import numpy as np
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms

logger = logging.getLogger(__name__)

# OSNet configuration
# Official torchreid osnet_x1_0 weights (imagenet pretrained)
OSNET_WEIGHTS_URL = "https://drive.google.com/uc?id=1vduhq5DpN2q1g4fYEZfPI17MJeh9qyrA"
OSNET_WEIGHTS_PATH = Path("/app/data/models/osnet_x1_0.pth")
EMBEDDING_DIM = 512


class ConvBlock(nn.Module):
    """Basic conv-bn-relu block."""
    def __init__(self, in_c, out_c, k=3, s=1, p=1):
        super().__init__()
        self.conv = nn.Conv2d(in_c, out_c, k, stride=s, padding=p, bias=False)
        self.bn = nn.BatchNorm2d(out_c)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))


class LightConv3x3(nn.Module):
    """Lightweight 3x3 convolution (pointwise + depthwise, matching torchreid)."""
    def __init__(self, in_c, out_c):
        super().__init__()
        # torchreid order: 1x1 pointwise first, then 3x3 depthwise
        self.conv1 = nn.Conv2d(in_c, out_c, 1, bias=False)
        self.conv2 = nn.Conv2d(out_c, out_c, 3, padding=1, groups=out_c, bias=False)
        self.bn = nn.BatchNorm2d(out_c)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.relu(self.bn(self.conv2(self.conv1(x))))


class ChannelGate(nn.Module):
    """Channel attention gate."""
    def __init__(self, in_c, reduction=16):
        super().__init__()
        mid_c = in_c // reduction
        self.global_avgpool = nn.AdaptiveAvgPool2d(1)
        self.fc1 = nn.Conv2d(in_c, mid_c, 1, bias=True)
        self.fc2 = nn.Conv2d(mid_c, in_c, 1, bias=True)

    def forward(self, x):
        out = self.global_avgpool(x)
        out = F.relu(self.fc1(out))
        out = torch.sigmoid(self.fc2(out))
        return x * out


class OSBlock(nn.Module):
    """Omni-scale feature learning block."""
    def __init__(self, in_c, out_c, reduction=4):
        super().__init__()
        mid_c = out_c // reduction
        self.conv1 = ConvBlock(in_c, mid_c, k=1, p=0)
        self.conv2a = LightConv3x3(mid_c, mid_c)
        self.conv2b = nn.Sequential(
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
        )
        self.conv2c = nn.Sequential(
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
        )
        self.conv2d = nn.Sequential(
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
            LightConv3x3(mid_c, mid_c),
        )
        self.gate = ChannelGate(mid_c)
        self.conv3 = ConvBlock(mid_c, out_c, k=1, p=0)
        self.downsample = None
        if in_c != out_c:
            self.downsample = ConvBlock(in_c, out_c, k=1, p=0)

    def forward(self, x):
        identity = x
        x1 = self.conv1(x)
        x2a = self.conv2a(x1)
        x2b = self.conv2b(x1)
        x2c = self.conv2c(x1)
        x2d = self.conv2d(x1)
        x2 = self.gate(x2a) + self.gate(x2b) + self.gate(x2c) + self.gate(x2d)
        x3 = self.conv3(x2)
        if self.downsample is not None:
            identity = self.downsample(identity)
        out = x3 + identity
        return F.relu(out)


class OSNet(nn.Module):
    """Omni-Scale Network for person re-identification."""
    def __init__(self, num_classes=1000, blocks=[2, 2, 2], channels=[64, 256, 384, 512]):
        super().__init__()
        self.conv1 = ConvBlock(3, channels[0], k=7, s=2, p=3)
        self.maxpool = nn.MaxPool2d(3, stride=2, padding=1)
        self.conv2 = self._make_layer(channels[0], channels[1], blocks[0])
        self.pool2 = nn.Sequential(
            ConvBlock(channels[1], channels[1], k=1, p=0),
            nn.AvgPool2d(2, stride=2)
        )
        self.conv3 = self._make_layer(channels[1], channels[2], blocks[1])
        self.pool3 = nn.Sequential(
            ConvBlock(channels[2], channels[2], k=1, p=0),
            nn.AvgPool2d(2, stride=2)
        )
        self.conv4 = self._make_layer(channels[2], channels[3], blocks[2])
        self.conv5 = ConvBlock(channels[3], channels[3], k=1, p=0)
        self.global_avgpool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(channels[3], num_classes)
        self.feature_dim = channels[3]

    def _make_layer(self, in_c, out_c, blocks):
        layers = [OSBlock(in_c, out_c)]
        for _ in range(1, blocks):
            layers.append(OSBlock(out_c, out_c))
        return nn.Sequential(*layers)

    def forward(self, x, return_embedding=True):
        x = self.conv1(x)
        x = self.maxpool(x)
        x = self.conv2(x)
        x = self.pool2(x)
        x = self.conv3(x)
        x = self.pool3(x)
        x = self.conv4(x)
        x = self.conv5(x)
        x = self.global_avgpool(x)
        x = x.view(x.size(0), -1)
        if return_embedding:
            return x
        return self.fc(x)


class ReIDService:
    """Service for person re-identification using OSNet."""

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[OSNet] = None
        self.transform = transforms.Compose([
            transforms.Resize((256, 128)),  # Standard ReID input size
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize the OSNet model."""
        if self._initialized:
            return True

        try:
            # Ensure model directory exists
            OSNET_WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)

            # Download weights if not present
            if not OSNET_WEIGHTS_PATH.exists():
                logger.info("Downloading OSNet weights...")
                await self._download_weights()

            # Load model
            logger.info(f"Loading OSNet model on {self.device}...")
            self.model = OSNet(num_classes=1000)

            if OSNET_WEIGHTS_PATH.exists():
                state_dict = torch.load(OSNET_WEIGHTS_PATH, map_location=self.device)
                # Handle different weight formats
                if "state_dict" in state_dict:
                    state_dict = state_dict["state_dict"]
                # Remove classifier weights if present
                state_dict = {k: v for k, v in state_dict.items() if not k.startswith("fc.")}
                self.model.load_state_dict(state_dict, strict=False)
                logger.info("Loaded pretrained OSNet weights")
            else:
                logger.warning("Using randomly initialized OSNet (no pretrained weights)")

            self.model = self.model.to(self.device)
            self.model.eval()
            self._initialized = True
            logger.info("ReID service initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize ReID service: {e}")
            return False

    async def _download_weights(self):
        """Download OSNet pretrained weights."""
        try:
            import gdown
            gdown.download(OSNET_WEIGHTS_URL, str(OSNET_WEIGHTS_PATH), quiet=False)
        except Exception as e:
            logger.error(f"Failed to download weights: {e}")
            # Continue without pretrained weights

    def _preprocess_image(self, image: Image.Image) -> torch.Tensor:
        """Preprocess image for model input."""
        if image.mode != "RGB":
            image = image.convert("RGB")
        tensor = self.transform(image)
        return tensor.unsqueeze(0).to(self.device)

    def _load_image_from_base64(self, base64_data: str) -> Image.Image:
        """Load image from base64 string."""
        # Handle data URL prefix
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        image_bytes = base64.b64decode(base64_data)
        return Image.open(io.BytesIO(image_bytes))

    async def extract_features(self, image_data: str | Image.Image | bytes) -> Optional[np.ndarray]:
        """
        Extract appearance embedding from person image.

        Args:
            image_data: Base64 string, PIL Image, or bytes

        Returns:
            512-dimensional embedding vector, or None on failure
        """
        if not self._initialized:
            await self.initialize()

        if self.model is None:
            logger.error("Model not loaded")
            return None

        input_tensor = None
        embedding = None
        image = None
        image_buffer = None
        owns_image = False  # Track if we created the image (need to close it)

        try:
            # Load image based on input type
            if isinstance(image_data, str):
                image = self._load_image_from_base64(image_data)
                owns_image = True
            elif isinstance(image_data, bytes):
                image_buffer = io.BytesIO(image_data)
                image = Image.open(image_buffer)
                owns_image = True
            else:
                image = image_data
                owns_image = False  # Caller owns it

            # Preprocess and extract features
            input_tensor = self._preprocess_image(image)

            with torch.no_grad():
                embedding = self.model(input_tensor, return_embedding=True)
                # L2 normalize the embedding
                embedding = F.normalize(embedding, p=2, dim=1)
                # Move to CPU and convert to numpy BEFORE cleanup
                result = embedding.cpu().numpy().flatten().copy()  # .copy() to detach from tensor

            return result

        except Exception as e:
            logger.error(f"Failed to extract features: {e}")
            return None
        finally:
            # Explicit cleanup of GPU tensors to prevent memory leak
            if input_tensor is not None:
                del input_tensor
            if embedding is not None:
                del embedding
            # Close PIL image if we created it
            if image is not None and owns_image:
                try:
                    image.close()
                except Exception:
                    pass
            if image is not None:
                del image
            # Close BytesIO buffer
            if image_buffer is not None:
                try:
                    image_buffer.close()
                except Exception:
                    pass
                del image_buffer
            # Clear CUDA cache if using GPU
            if self.device.type == 'cuda':
                torch.cuda.empty_cache()

    def compare_embeddings(
        self,
        emb1: np.ndarray,
        emb2: np.ndarray
    ) -> float:
        """
        Compare two embeddings and return similarity score.

        Args:
            emb1: First embedding vector
            emb2: Second embedding vector

        Returns:
            Cosine similarity score (0-1, higher is more similar)
        """
        # Normalize embeddings
        emb1_norm = emb1 / (np.linalg.norm(emb1) + 1e-8)
        emb2_norm = emb2 / (np.linalg.norm(emb2) + 1e-8)
        # Cosine similarity
        similarity = np.dot(emb1_norm, emb2_norm)
        return float(similarity)

    def find_match(
        self,
        query_embedding: np.ndarray,
        known_embeddings: List[Tuple[int, np.ndarray]],
        threshold: float = 0.7
    ) -> Optional[Tuple[int, float]]:
        """
        Find the best matching person from known embeddings.

        Args:
            query_embedding: Embedding to match
            known_embeddings: List of (person_id, embedding) tuples
            threshold: Minimum similarity to consider a match

        Returns:
            (person_id, similarity) tuple or None if no match found
        """
        if not known_embeddings:
            return None

        best_match = None
        best_score = threshold

        for person_id, embedding in known_embeddings:
            similarity = self.compare_embeddings(query_embedding, embedding)
            if similarity > best_score:
                best_score = similarity
                best_match = (person_id, similarity)

        return best_match

    def find_matches_batch(
        self,
        query_embedding: np.ndarray,
        known_embeddings: List[Tuple[int, List[np.ndarray]]],
        threshold: float = 0.7,
        use_average: bool = True
    ) -> Optional[Tuple[int, float]]:
        """
        Find match when persons have multiple embeddings.

        Args:
            query_embedding: Embedding to match
            known_embeddings: List of (person_id, [embeddings]) tuples
            threshold: Minimum similarity threshold
            use_average: If True, compare against average embedding

        Returns:
            (person_id, similarity) tuple or None if no match
        """
        if not known_embeddings:
            return None

        best_match = None
        best_score = threshold

        for person_id, embeddings in known_embeddings:
            if not embeddings:
                continue

            if use_average:
                # Compare against average embedding
                avg_embedding = np.mean(embeddings, axis=0)
                similarity = self.compare_embeddings(query_embedding, avg_embedding)
            else:
                # Compare against each and take max
                similarities = [
                    self.compare_embeddings(query_embedding, emb)
                    for emb in embeddings
                ]
                similarity = max(similarities)

            if similarity > best_score:
                best_score = similarity
                best_match = (person_id, similarity)

        return best_match

    def is_initialized(self) -> bool:
        """Check if the service is initialized."""
        return self._initialized

    def get_embedding_dim(self) -> int:
        """Get the embedding dimension."""
        return EMBEDDING_DIM


# Global singleton instance
_reid_service: Optional[ReIDService] = None


def get_reid_service() -> ReIDService:
    """Get the global ReID service instance."""
    global _reid_service
    if _reid_service is None:
        _reid_service = ReIDService()
    return _reid_service
