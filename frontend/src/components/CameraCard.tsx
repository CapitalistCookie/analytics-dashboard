import { useState, useEffect, useRef, memo, useCallback } from 'react'
import CameraFeedModal, { type ViewMode } from './CameraFeedModal'
import { useStreamQuality } from '../context/StreamQualityContext'
import { useCamera } from '../context/CameraContext'

// Double-tap detection timeout (ms)
const DOUBLE_TAP_DELAY = 300

interface CameraCardProps {
  cameraId: string
  cameraName?: string
  fps?: number
  status?: 'online' | 'offline' | 'degraded'
  showFps?: boolean
  showStatus?: boolean
  className?: string
  refreshInterval?: number | null // Auto-refresh interval in ms, null for manual
  initialMode?: ViewMode
  compact?: boolean
  lazyLoad?: boolean // Only load when visible
  thumbnailSize?: number // Width for thumbnail, null for full size
}

function CameraCardInner({
  cameraId,
  cameraName,
  fps = 0,
  status,
  showFps = true,
  showStatus = true,
  className = '',
  refreshInterval = null,
  initialMode = 'snapshot',
  compact = false,
  lazyLoad = true,
  thumbnailSize = 320,
}: CameraCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [imageKey, setImageKey] = useState(Date.now())
  const [isVisible, setIsVisible] = useState(!lazyLoad) // Start visible if lazy loading disabled
  const [hasLoaded, setHasLoaded] = useState(false)
  const lastTapRef = useRef<number>(0)
  const tapTimeoutRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { getSnapshotUrl } = useStreamQuality()
  const { getDisplayName } = useCamera()

  // Use provided name or get from context
  const displayName = cameraName || getDisplayName(cameraId)

  // Cleanup tap timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
      }
    }
  }, [])

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazyLoad || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            setHasLoaded(true)
          } else {
            // Keep showing if already loaded, but pause refresh
            setIsVisible(false)
          }
        })
      },
      {
        rootMargin: '100px', // Start loading 100px before visible
        threshold: 0.1,
      }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [lazyLoad])

  // Auto-refresh only if visible and interval is set
  useEffect(() => {
    if (refreshInterval === null || !isVisible) return

    const interval = setInterval(() => {
      setImageKey(Date.now())
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [refreshInterval, isVisible])

  // Unified tap/click handler for double-tap detection
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to avoid zoom on double-tap
    e.preventDefault()

    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current

    if (timeSinceLastTap < DOUBLE_TAP_DELAY && timeSinceLastTap > 0) {
      // Double tap detected
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
        tapTimeoutRef.current = null
      }
      setShowModal(true)
    } else {
      // First tap - wait to see if there's a second tap
      lastTapRef.current = now
    }
  }, [])

  // Handle touch end for mobile double-tap
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Prevent ghost clicks
    e.preventDefault()
    handleTap(e)
  }, [handleTap])

  // Handle click for desktop double-click
  const handleClick = useCallback((e: React.MouseEvent) => {
    handleTap(e)
  }, [handleTap])

  // Handle native double-click event (desktop browsers)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowModal(true)
  }, [])

  const getStatusColor = () => {
    if (status) {
      switch (status) {
        case 'online': return 'bg-green-500'
        case 'degraded': return 'bg-yellow-500'
        case 'offline': return 'bg-red-500'
      }
    }
    return fps > 0 ? 'bg-green-500' : 'bg-red-500'
  }

  // Get thumbnail URL with optional size
  const getThumbnailUrl = () => {
    // For grid view, use smaller thumbnails
    if (thumbnailSize && thumbnailSize < 640) {
      // Use Frigate's built-in resize for thumbnails
      return `/frigate/api/${cameraId}/latest.jpg?h=${Math.round(thumbnailSize * 9 / 16)}&t=${imageKey}`
    }
    return getSnapshotUrl(cameraId, imageKey)
  }

  return (
    <>
      <div
        ref={containerRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onTouchEnd={handleTouchEnd}
        className={`relative bg-gray-700 rounded-lg overflow-hidden aspect-video cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all touch-manipulation ${className}`}
        title="Double-tap to enlarge"
      >
        {/* Loading skeleton */}
        {lazyLoad && !hasLoaded && (
          <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Only render image if visible or already loaded */}
        {(isVisible || hasLoaded) && (
          <img
            key={imageKey}
            src={getThumbnailUrl()}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Feed</text></svg>'
            }}
          />
        )}

        {/* Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className={`font-medium text-white truncate ${compact ? 'text-xs' : 'text-xs md:text-sm'}`}>
            {displayName}
          </p>
          {showFps && (
            <p className="text-xs text-gray-400">{fps?.toFixed(1) ?? 0} fps</p>
          )}
        </div>

        {/* Status indicator */}
        {showStatus && (
          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${getStatusColor()}`} />
        )}

        {/* Expand button - always visible */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setShowModal(true)
          }}
          onTouchEnd={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setShowModal(true)
          }}
          className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 active:bg-black/90 rounded p-1.5 transition-colors touch-manipulation"
          title="Expand camera view"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <CameraFeedModal
          cameraId={cameraId}
          cameraName={displayName}
          onClose={() => setShowModal(false)}
          initialMode={initialMode}
        />
      )}
    </>
  )
}

// Memoize to prevent unnecessary re-renders
const CameraCard = memo(CameraCardInner, (prevProps, nextProps) => {
  // Only re-render if these props change
  return (
    prevProps.cameraId === nextProps.cameraId &&
    prevProps.fps === nextProps.fps &&
    prevProps.status === nextProps.status &&
    prevProps.refreshInterval === nextProps.refreshInterval &&
    prevProps.lazyLoad === nextProps.lazyLoad &&
    prevProps.thumbnailSize === nextProps.thumbnailSize
  )
})

export default CameraCard
