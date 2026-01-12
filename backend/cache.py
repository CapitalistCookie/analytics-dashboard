"""Simple in-memory cache with TTL for Frigate responses."""

import time
from typing import Any, Optional
from functools import wraps
import asyncio

# Maximum cache entries to prevent memory leak
MAX_CACHE_SIZE = 500
CLEANUP_THRESHOLD = 100  # Clean up when cache exceeds this many expired entries


class TTLCache:
    """Thread-safe in-memory cache with TTL and size limits."""

    def __init__(self, max_size: int = MAX_CACHE_SIZE):
        self._cache: dict[str, tuple[Any, float]] = {}
        self._lock = asyncio.Lock()
        self._max_size = max_size
        self._access_count = 0

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        self._access_count += 1

        # Periodic cleanup every 100 accesses
        if self._access_count % CLEANUP_THRESHOLD == 0:
            await self._cleanup_expired()

        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                return value
            # Expired, remove it
            async with self._lock:
                self._cache.pop(key, None)
        return None

    async def set(self, key: str, value: Any, ttl: float = 2.0):
        """Set value in cache with TTL in seconds."""
        async with self._lock:
            # Enforce max size - remove oldest entries if needed
            if len(self._cache) >= self._max_size:
                await self._evict_oldest_unlocked()

            self._cache[key] = (value, time.time() + ttl)

    async def _cleanup_expired(self):
        """Remove all expired entries."""
        async with self._lock:
            now = time.time()
            expired_keys = [k for k, (_, expiry) in self._cache.items() if expiry < now]
            for k in expired_keys:
                del self._cache[k]

    async def _evict_oldest_unlocked(self):
        """Evict oldest entries (must be called with lock held)."""
        # Remove expired first
        now = time.time()
        expired_keys = [k for k, (_, expiry) in self._cache.items() if expiry < now]
        for k in expired_keys:
            del self._cache[k]

        # If still over limit, remove entries with earliest expiry
        if len(self._cache) >= self._max_size:
            # Sort by expiry time and remove oldest half
            sorted_items = sorted(self._cache.items(), key=lambda x: x[1][1])
            to_remove = len(self._cache) - (self._max_size // 2)
            for k, _ in sorted_items[:to_remove]:
                del self._cache[k]

    async def clear(self):
        """Clear all cached values."""
        async with self._lock:
            self._cache.clear()

    def get_sync(self, key: str) -> Optional[Any]:
        """Synchronous get for simple cases."""
        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                return value
            self._cache.pop(key, None)
        return None

    def set_sync(self, key: str, value: Any, ttl: float = 2.0):
        """Synchronous set for simple cases."""
        # Enforce max size
        if len(self._cache) >= self._max_size:
            # Simple sync cleanup - remove expired
            now = time.time()
            expired_keys = [k for k, (_, expiry) in self._cache.items() if expiry < now]
            for k in expired_keys:
                del self._cache[k]

            # If still over, remove half
            if len(self._cache) >= self._max_size:
                sorted_items = sorted(self._cache.items(), key=lambda x: x[1][1])
                to_remove = len(self._cache) - (self._max_size // 2)
                for k, _ in sorted_items[:to_remove]:
                    del self._cache[k]

        self._cache[key] = (value, time.time() + ttl)

    def size(self) -> int:
        """Get current cache size."""
        return len(self._cache)


# Global cache instance
frigate_cache = TTLCache()


def cached(ttl: float = 2.0, key_prefix: str = ""):
    """Decorator to cache async function results."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from function name and arguments
            cache_key = f"{key_prefix}{func.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"

            # Check cache
            cached_value = await frigate_cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = await func(*args, **kwargs)
            await frigate_cache.set(cache_key, result, ttl)
            return result

        return wrapper
    return decorator
