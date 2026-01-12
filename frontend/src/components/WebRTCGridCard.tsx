import { useState, useEffect, useRef, useCallback, memo } from 'react'
import WebRTCPlayer from './WebRTCPlayer'
import CameraFeedModal from './CameraFeedModal'
import { useStreamQuality } from '../context/StreamQualityContext'
import { useCamera } from '../context/CameraContext'
import { useWebRTCConnectionManager } from '../context/WebRTCConnectionManager'

interface WebRTCGridCardProps {
  cameraId: string
  fps?: number
  status?: 'online' | 'offline' | 'degraded'
  visibilityIndex: number  // Lower = more visible (for priority)
  showDetections?: boolean  // Show detection bounding boxes
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed'

// Session-level cache of cameras that have failed WebRTC
const failedCamerasSession = new Set<string>()

function WebRTCGridCardInner({
  cameraId,
  fps = 0,
  status,
  visibilityIndex,
  showDetections = false,
}: WebRTCGridCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [hasWebRTCSlot, setHasWebRTCSlot] = useState(false)
  const [webrtcState, setWebrtcState] = useState<ConnectionState>('disconnected')
  const [webrtcFailed, setWebrtcFailed] = useState(() => failedCamerasSession.has(cameraId))
  const [fallbackTimestamp, setFallbackTimestamp] = useState(Date.now())
  const [, setFailureCount] = useState(0)  // Track failures for session-based caching
  const containerRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<number | null>(null)

  const { config, getFallbackUrl, getLiveUrl } = useStreamQuality()
  const { getDisplayName } = useCamera()
  const { requestConnection, releaseConnection } = useWebRTCConnectionManager()

  const displayName = getDisplayName(cameraId)

  // IntersectionObserver for visibility tracking
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting)
        })
      },
      {
        rootMargin: '50px',  // Start loading slightly before visible
        threshold: 0.1,
      }
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Request/release WebRTC connection based on visibility
  useEffect(() => {
    if (isVisible && config.liveMode === 'webrtc' && !webrtcFailed) {
      const gotSlot = requestConnection(cameraId, visibilityIndex)
      setHasWebRTCSlot(gotSlot)
    } else {
      releaseConnection(cameraId)
      setHasWebRTCSlot(false)
    }

    return () => {
      releaseConnection(cameraId)
    }
  }, [isVisible, visibilityIndex, cameraId, config.liveMode, webrtcFailed, requestConnection, releaseConnection])

  // Handle WebRTC state changes
  const handleWebRTCStateChange = useCallback((state: ConnectionState) => {
    setWebrtcState(state)
    if (state === 'failed') {
      setFailureCount(prev => {
        const newCount = prev + 1
        // After 2 failures, mark as failed for this session
        if (newCount >= 2) {
          failedCamerasSession.add(cameraId)
          setWebrtcFailed(true)
        }
        return newCount
      })
    } else if (state === 'connected') {
      // Reset failure count on successful connection
      setFailureCount(0)
      setWebrtcFailed(false)
      failedCamerasSession.delete(cameraId)
    }
  }, [cameraId])

  const handleWebRTCError = useCallback(() => {
    setFailureCount(prev => {
      const newCount = prev + 1
      if (newCount >= 2) {
        failedCamerasSession.add(cameraId)
        setWebrtcFailed(true)
      }
      return newCount
    })
  }, [cameraId])

  // Frigate snapshot polling for fallback mode (every 2 seconds)
  useEffect(() => {
    const shouldPoll = isVisible && !hasWebRTCSlot && config.liveMode === 'webrtc'

    if (shouldPoll) {
      // Start polling every 2 seconds
      pollingIntervalRef.current = window.setInterval(() => {
        setFallbackTimestamp(Date.now())
      }, 2000)
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [isVisible, hasWebRTCSlot, config.liveMode])

  // Handle double-click to open modal
  const handleDoubleClick = useCallback(() => {
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

  // Determine what to render
  const shouldUseWebRTC = hasWebRTCSlot && !webrtcFailed && config.liveMode === 'webrtc'
  const shouldUseMJPEG = config.liveMode === 'mjpeg'
  const shouldUsePolling = !shouldUseWebRTC && !shouldUseMJPEG

  return (
    <>
      <div
        ref={containerRef}
        onDoubleClick={handleDoubleClick}
        className="relative bg-gray-700 rounded-lg overflow-hidden aspect-video cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
        title="Double-tap to enlarge"
      >
        {/* Loading skeleton when not visible */}
        {!isVisible && (
          <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* WebRTC stream */}
        {isVisible && shouldUseWebRTC && (
          <WebRTCPlayer
            cameraId={cameraId}
            streamType={config.streamType}
            onStateChange={handleWebRTCStateChange}
            onError={handleWebRTCError}
            className="w-full h-full"
            muted={true}
            autoPlay={true}
            showDetections={showDetections}
            detectionRefreshInterval={500}
          />
        )}

        {/* MJPEG stream (Low quality) */}
        {isVisible && shouldUseMJPEG && (
          <img
            src={getLiveUrl(cameraId, true)}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
            }}
          />
        )}

        {/* Polling fallback using Frigate snapshots (when no WebRTC slot or WebRTC failed) */}
        {isVisible && shouldUsePolling && (
          <img
            key={fallbackTimestamp}
            src={getFallbackUrl(cameraId, fallbackTimestamp)}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
            }}
          />
        )}

        {/* Overlay with camera name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className="font-medium text-white truncate text-xs md:text-sm">{displayName}</p>
          <p className="text-xs text-gray-400">{fps?.toFixed(1) ?? 0} fps</p>
        </div>

        {/* Live indicator */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded">
          <span className={`w-2 h-2 rounded-full ${
            shouldUseWebRTC
              ? webrtcState === 'connected' ? 'bg-green-500' : webrtcState === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
              : shouldUsePolling ? 'bg-blue-500' : 'bg-red-500 animate-pulse'
          }`}></span>
          <span className="text-xs font-bold text-white">
            {shouldUseWebRTC
              ? webrtcState === 'connecting' ? 'Connecting...' : webrtcState === 'connected' ? 'WebRTC' : 'Failed'
              : shouldUseMJPEG ? 'MJPEG' : 'Snapshot'
            }
          </span>
        </div>

        {/* Status indicator */}
        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${getStatusColor()}`} />

        {/* Fallback mode indicator */}
        {shouldUsePolling && isVisible && (
          <div className="absolute top-8 left-2 flex items-center gap-1 bg-blue-600/80 px-1.5 py-0.5 rounded">
            <span className="text-xs text-white">
              {webrtcFailed ? 'WebRTC unavailable' : 'Using snapshots'}
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CameraFeedModal
          cameraId={cameraId}
          cameraName={displayName}
          onClose={() => setShowModal(false)}
          initialMode="live"
        />
      )}
    </>
  )
}

// Memoize to prevent unnecessary re-renders
const WebRTCGridCard = memo(WebRTCGridCardInner, (prevProps, nextProps) => {
  return (
    prevProps.cameraId === nextProps.cameraId &&
    prevProps.fps === nextProps.fps &&
    prevProps.status === nextProps.status &&
    prevProps.visibilityIndex === nextProps.visibilityIndex &&
    prevProps.showDetections === nextProps.showDetections
  )
})

export default WebRTCGridCard
