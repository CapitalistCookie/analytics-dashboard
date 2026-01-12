import { useState, useEffect, useRef, useCallback } from 'react'
import { getEvents, quickCreateStaff, addFaceFromDetection, type Event, type Staff } from '../api/client'
import { useStreamQuality, QUALITY_CONFIGS, type StreamQuality } from '../context/StreamQualityContext'
import { useCamera } from '../context/CameraContext'
import WebRTCPlayer from './WebRTCPlayer'
import DetectionOverlay, { type Detection } from './DetectionOverlay'
import LabelingModal from './LabelingModal'

export type ViewMode = 'snapshot' | 'live' | 'detection'

interface RefreshOption {
  label: string
  value: number | null // null = manual
}

const REFRESH_OPTIONS: RefreshOption[] = [
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: 'Manual', value: null },
]

// For live polling mode (fallback when WebRTC unavailable)
const LIVE_POLLING_INTERVAL_HD = 500 // 2 fps for medium/high quality (go2rtc is slow)
const LIVE_POLLING_INTERVAL_LOW = 250 // 4 fps for low quality (Frigate is fast)

// Frame loading timeout - go2rtc can be slow
const FRAME_LOAD_TIMEOUT = 8000 // 8 seconds timeout for HD frames

// Number of consecutive failures before auto-downgrading quality or falling back
const FAILURE_THRESHOLD = 3

const DETECTION_COLORS: Record<string, string> = {
  person: '#22c55e', // green
  car: '#eab308', // yellow
  dog: '#f97316', // orange
  cat: '#a855f7', // purple
  motorcycle: '#06b6d4', // cyan
  bicycle: '#ec4899', // pink
  default: '#3b82f6', // blue
}

interface CameraFeedModalProps {
  cameraId: string
  cameraName?: string
  onClose: () => void
  initialMode?: ViewMode
}

export default function CameraFeedModal({ cameraId, cameraName, onClose, initialMode = 'snapshot' }: CameraFeedModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode)
  const [refreshInterval, setRefreshInterval] = useState<number | null>(() => {
    const saved = localStorage.getItem('cameraRefreshInterval')
    return saved ? JSON.parse(saved) : 5000
  })
  const [countdown, setCountdown] = useState<number>(0)
  const [isPaused, setIsPaused] = useState(false)
  const [imageKey, setImageKey] = useState(Date.now())
  const [detections, setDetections] = useState<Detection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isHdFrameLoading, setIsHdFrameLoading] = useState(false)
  const [livePollingKey, setLivePollingKey] = useState(Date.now())
  const [hdFailureCount, setHdFailureCount] = useState(0)
  const [hdAutoDowngraded, setHdAutoDowngraded] = useState(false)
  const [frameLoadError, setFrameLoadError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [webrtcFallbackToMjpeg, setWebrtcFallbackToMjpeg] = useState(false)
  const [webrtcFailCount, setWebrtcFailCount] = useState(0)
  const [showLiveDetections, setShowLiveDetections] = useState(() => {
    const saved = localStorage.getItem('showLiveDetections')
    return saved ? JSON.parse(saved) : false
  })
  const [showSnapshotDetections, setShowSnapshotDetections] = useState(() => {
    const saved = localStorage.getItem('showSnapshotDetections')
    return saved ? JSON.parse(saved) : false
  })
  // Labeling mode state
  const [labelMode, setLabelMode] = useState(false)
  const [labelingModalOpen, setLabelingModalOpen] = useState(false)
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [capturedImageData, setCapturedImageData] = useState<string | null>(null)

  const { quality, setQuality, config, getSnapshotUrl, getLiveUrl } = useStreamQuality()
  const { getDisplayName, isCustomName, renameCameraFn, resetCameraNameFn } = useCamera()

  // Get the display name for this camera
  const displayName = cameraName || getDisplayName(cameraId)

  // Determine the live mode to use
  const isWebRTCLiveMode = viewMode === 'live' && config.liveMode === 'webrtc' && !webrtcFallbackToMjpeg
  const isPollingLiveMode = viewMode === 'live' && (config.liveMode === 'polling' || (config.liveMode === 'webrtc' && webrtcFallbackToMjpeg))
  // MJPEG is the default fallback when not using WebRTC or polling

  // Handle WebRTC state changes
  const handleWebRTCStateChange = useCallback((state: 'disconnected' | 'connecting' | 'connected' | 'failed') => {
    if (state === 'failed') {
      setWebrtcFailCount(prev => prev + 1)
    } else if (state === 'connected') {
      setWebrtcFailCount(0)  // Reset on successful connection
    }
  }, [])

  // Handle WebRTC errors
  const handleWebRTCError = useCallback((error: string) => {
    console.error('WebRTC error in modal:', error)
    setWebrtcFailCount(prev => prev + 1)
  }, [])

  // Auto-fallback to MJPEG after 3 WebRTC failures
  useEffect(() => {
    if (webrtcFailCount >= FAILURE_THRESHOLD && !webrtcFallbackToMjpeg) {
      setWebrtcFallbackToMjpeg(true)
      setFrameLoadError('WebRTC unavailable - switched to MJPEG fallback')
    }
  }, [webrtcFailCount, webrtcFallbackToMjpeg])

  // Reset WebRTC fallback when quality changes
  useEffect(() => {
    setWebrtcFallbackToMjpeg(false)
    setWebrtcFailCount(0)
  }, [quality])

  // Handle camera rename
  const handleRename = async () => {
    if (!renameValue.trim()) {
      setRenameError('Name cannot be empty')
      return
    }
    try {
      await renameCameraFn(cameraId, renameValue.trim())
      setIsRenaming(false)
      setRenameError(null)
    } catch {
      setRenameError('Failed to rename camera')
    }
  }

  const handleResetName = async () => {
    try {
      await resetCameraNameFn(cameraId)
      setIsRenaming(false)
      setRenameError(null)
    } catch {
      setRenameError('Failed to reset camera name')
    }
  }

  const openRenameDialog = () => {
    setRenameValue(getDisplayName(cameraId))
    setRenameError(null)
    setIsRenaming(true)
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const snapshotRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Save refresh interval preference
  useEffect(() => {
    localStorage.setItem('cameraRefreshInterval', JSON.stringify(refreshInterval))
  }, [refreshInterval])

  // Save live detection preference
  useEffect(() => {
    localStorage.setItem('showLiveDetections', JSON.stringify(showLiveDetections))
  }, [showLiveDetections])

  // Save snapshot detection preference
  useEffect(() => {
    localStorage.setItem('showSnapshotDetections', JSON.stringify(showSnapshotDetections))
  }, [showSnapshotDetections])

  // Determine effective polling interval based on quality
  const pollingInterval = quality === 'low' ? LIVE_POLLING_INTERVAL_LOW : LIVE_POLLING_INTERVAL_HD

  // Live polling mode - rapid frame refresh for Medium/High quality
  useEffect(() => {
    if (!isPollingLiveMode || isPaused) return

    // For HD modes, wait for previous frame to load before polling next
    // This prevents stacking requests when go2rtc is slow
    if (isHdFrameLoading && quality !== 'low') return

    const interval = setInterval(() => {
      setLivePollingKey(Date.now())
      if (quality !== 'low') {
        setIsHdFrameLoading(true)
      }
    }, pollingInterval)

    return () => clearInterval(interval)
  }, [isPollingLiveMode, isPaused, pollingInterval, isHdFrameLoading, quality])

  // Reset failure count when quality changes
  useEffect(() => {
    setHdFailureCount(0)
    setFrameLoadError(null)
    setHdAutoDowngraded(false)
  }, [quality])

  // Auto-downgrade to low quality after repeated failures
  useEffect(() => {
    if (hdFailureCount >= FAILURE_THRESHOLD && quality !== 'low' && !hdAutoDowngraded) {
      setHdAutoDowngraded(true)
      setQuality('low')
      setFrameLoadError('HD stream unavailable - switched to low quality')
    }
  }, [hdFailureCount, quality, hdAutoDowngraded, setQuality])

  // Fetch detections for overlay - only in-progress events for real-time positions
  const fetchDetections = useCallback(async () => {
    try {
      // Use in_progress=true to get only active events with real-time bounding boxes
      const res = await getEvents(10, cameraId, undefined, true)
      const events = res.data || []

      // Convert events to detections with bounding boxes
      // Frigate returns box as [x, y, width, height] normalized 0-1
      // We convert to [x1, y1, x2, y2] format for drawing
      const dets: Detection[] = events
        .filter((e: Event) => e.data?.box && e.data.box.length === 4)
        .map((e: Event) => {
          const [x, y, w, h] = e.data.box
          return {
            id: e.id,
            label: e.label,
            score: e.data?.score || 0,
            box: [x, y, x + w, y + h], // Convert [x, y, w, h] to [x1, y1, x2, y2]
            subLabel: e.sub_label || null,
            subLabelScore: null, // API doesn't provide this
            // ReID not available in polling mode
            personId: null,
            displayId: null,
            isStaff: false,
          }
        })

      setDetections(dets)
    } catch (err) {
      console.error('Failed to fetch detections:', err)
    }
  }, [cameraId])

  // Refresh snapshot and detections
  const refresh = useCallback(() => {
    setImageKey(Date.now())
    if (viewMode === 'detection') {
      fetchDetections()
    }
  }, [viewMode, fetchDetections])

  // Auto-refresh countdown
  useEffect(() => {
    if (viewMode === 'live' || refreshInterval === null || isPaused) {
      setCountdown(0)
      return
    }

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          refresh()
          return refreshInterval / 1000
        }
        return prev - 1
      })
    }, 1000)

    // Initial countdown
    setCountdown(refreshInterval / 1000)

    return () => clearInterval(interval)
  }, [refreshInterval, isPaused, viewMode, refresh])

  // Initial detection fetch
  useEffect(() => {
    if (viewMode === 'detection') {
      fetchDetections()
    }
  }, [viewMode, fetchDetections])

  // Draw detection overlay on canvas
  useEffect(() => {
    if (viewMode !== 'detection' || !canvasRef.current || !imageRef.current) return

    const canvas = canvasRef.current
    const img = imageRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      // Set canvas size to match image display size
      canvas.width = img.clientWidth
      canvas.height = img.clientHeight

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw each detection box
      detections.forEach(det => {
        const [x1, y1, x2, y2] = det.box
        const color = DETECTION_COLORS[det.label] || DETECTION_COLORS.default

        // Convert normalized coordinates to canvas coordinates
        const canvasX1 = x1 * canvas.width
        const canvasY1 = y1 * canvas.height
        const canvasX2 = x2 * canvas.width
        const canvasY2 = y2 * canvas.height
        const width = canvasX2 - canvasX1
        const height = canvasY2 - canvasY1

        // Draw bounding box
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(canvasX1, canvasY1, width, height)

        // Draw label background
        const label = `${det.label} ${Math.round(det.score * 100)}%`
        ctx.font = 'bold 12px sans-serif'
        const metrics = ctx.measureText(label)
        const labelHeight = 18
        const labelPadding = 4

        ctx.fillStyle = color
        ctx.fillRect(canvasX1, canvasY1 - labelHeight, metrics.width + labelPadding * 2, labelHeight)

        // Draw label text
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, canvasX1 + labelPadding, canvasY1 - 5)
      })
    }

    // Wait for image to load
    if (img.complete) {
      draw()
    } else {
      img.onload = draw
    }
  }, [detections, viewMode, imageKey])

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleImageLoad = () => {
    setIsLoading(false)
    setIsHdFrameLoading(false)
    // Reset failure count on successful load
    if (hdFailureCount > 0) {
      setHdFailureCount(0)
      setFrameLoadError(null)
    }
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoading(false)
    setIsHdFrameLoading(false)
    // Track HD failures
    if (quality !== 'low') {
      setHdFailureCount(prev => prev + 1)
    }
    ;(e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Feed</text></svg>'
  }

  // Timeout handler for HD frame loading
  const hdFrameTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (isHdFrameLoading && quality !== 'low') {
      // Set timeout for HD frame loading
      hdFrameTimeoutRef.current = window.setTimeout(() => {
        setIsHdFrameLoading(false)
        setHdFailureCount(prev => prev + 1)
        setFrameLoadError('HD frame loading timed out')
      }, FRAME_LOAD_TIMEOUT)
    }

    return () => {
      if (hdFrameTimeoutRef.current) {
        clearTimeout(hdFrameTimeoutRef.current)
        hdFrameTimeoutRef.current = null
      }
    }
  }, [isHdFrameLoading, quality, livePollingKey])

  // Labeling mode handlers
  const handleDetectionClick = useCallback((detection: Detection, imageData: string | null) => {
    setSelectedDetection(detection)
    setCapturedImageData(imageData)
    setLabelingModalOpen(true)
  }, [])

  const handleLabelAsStaff = useCallback(async (staffId: number, addPhoto: boolean): Promise<void> => {
    if (!capturedImageData || !addPhoto) return
    await addFaceFromDetection(staffId, { face_image: capturedImageData })
  }, [capturedImageData])

  const handleCreateStaff = useCallback(async (name: string, role: string, imageData: string): Promise<Staff> => {
    const res = await quickCreateStaff({ name, role, face_image: imageData })
    return res.data
  }, [])

  const handleLabelAsCustomer = useCallback(() => {
    // For now, just close the modal - customer tracking not fully implemented
    console.log('Labeled as customer:', selectedDetection?.id)
  }, [selectedDetection])

  const handleIgnoreDetection = useCallback(() => {
    // Just close the modal
    console.log('Ignored detection:', selectedDetection?.id)
  }, [selectedDetection])

  const handleLabelAsRegular = useCallback(async (personId: number, name: string, notes?: string): Promise<void> => {
    // For now, just log - regular customer tracking not fully implemented
    console.log('Labeled as regular:', { personId, name, notes })
  }, [])

  const handleCloseLabelingModal = useCallback(() => {
    setLabelingModalOpen(false)
    setSelectedDetection(null)
    setCapturedImageData(null)
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="bg-gray-800 rounded-lg w-full max-w-5xl mx-4 max-h-[95vh] overflow-hidden border border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename()
                    if (e.key === 'Escape') setIsRenaming(false)
                  }}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                  autoFocus
                  placeholder="Camera name"
                />
                <button
                  onClick={handleRename}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                >
                  Save
                </button>
                {isCustomName(cameraId) && (
                  <button
                    onClick={handleResetName}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm"
                    title="Reset to default"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setIsRenaming(false)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
                >
                  Cancel
                </button>
                {renameError && (
                  <span className="text-red-400 text-sm">{renameError}</span>
                )}
              </div>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white">{displayName}</h3>
                <button
                  onClick={openRenameDialog}
                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors"
                  title="Rename camera"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {isCustomName(cameraId) && (
                  <span className="text-xs text-blue-400 px-1.5 py-0.5 bg-blue-500/20 rounded">Custom</span>
                )}
              </>
            )}
            <span className="text-sm text-gray-400">{cameraId}</span>
            <span className="text-sm text-gray-400">{new Date().toLocaleTimeString()}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* View Mode & Quality Selector */}
        <div className="p-3 bg-gray-700/50 border-b border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              {(['snapshot', 'live', 'detection'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setViewMode(mode)
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    setViewMode(mode)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize touch-manipulation ${
                    viewMode === mode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white active:bg-gray-700'
                  }`}
                >
                  {mode === 'detection' ? 'Detection Overlay' : mode}
                </button>
              ))}
            </div>

            {/* Detection Toggle for Live Mode */}
            {viewMode === 'live' && isWebRTCLiveMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setShowLiveDetections(!showLiveDetections)
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setShowLiveDetections(!showLiveDetections)
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation flex items-center gap-2 ${
                  showLiveDetections
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title={showLiveDetections ? 'Hide detection boxes' : 'Show detection boxes'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                {showLiveDetections ? 'Detection ON' : 'Detection OFF'}
              </button>
            )}

            {/* Detection Toggle for Snapshot Mode */}
            {viewMode === 'snapshot' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setShowSnapshotDetections(!showSnapshotDetections)
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setShowSnapshotDetections(!showSnapshotDetections)
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation flex items-center gap-2 ${
                  showSnapshotDetections
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title={showSnapshotDetections ? 'Hide detection boxes' : 'Show detection boxes'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                {showSnapshotDetections ? 'Detection ON' : 'Detection OFF'}
              </button>
            )}

            {/* Label Mode Toggle - show when detection is ON */}
            {((viewMode === 'snapshot' && showSnapshotDetections) || (viewMode === 'live' && isWebRTCLiveMode && showLiveDetections)) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLabelMode(!labelMode)
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setLabelMode(!labelMode)
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation flex items-center gap-2 ${
                  labelMode
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title={labelMode ? 'Exit labeling mode' : 'Click boxes to label people'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {labelMode ? 'Label Mode ON' : 'Label Mode'}
              </button>
            )}

            {/* Quality Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Quality:</span>
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                {(['low', 'medium', 'high'] as StreamQuality[]).map(q => (
                  <button
                    key={q}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setQuality(q)
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setQuality(q)
                    }}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize touch-manipulation ${
                      quality === q
                        ? q === 'high' ? 'bg-green-600 text-white' : q === 'medium' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-white active:bg-gray-700'
                    }`}
                    title={QUALITY_CONFIGS[q].description}
                  >
                    {QUALITY_CONFIGS[q].label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-500">{config.resolution}</span>
            </div>
          </div>

          {/* Pause button for polling live mode */}
          {isPollingLiveMode && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setIsPaused(!isPaused)
              }}
              onTouchEnd={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setIsPaused(!isPaused)
              }}
              className={`px-3 py-2 rounded-lg transition-colors touch-manipulation ${
                isPaused ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' : 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800'
              } text-white flex items-center gap-2`}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-sm">Resume</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                  <span className="text-sm">Pause</span>
                </>
              )}
            </button>
          )}

          {/* Refresh Controls (only for snapshot/detection modes) */}
          {viewMode !== 'live' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Refresh:</span>
                <div className="flex bg-gray-800 rounded-lg p-0.5">
                  {REFRESH_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setRefreshInterval(opt.value)
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setRefreshInterval(opt.value)
                      }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors touch-manipulation ${
                        refreshInterval === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white active:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {refreshInterval !== null && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setIsPaused(!isPaused)
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setIsPaused(!isPaused)
                    }}
                    className={`p-2 rounded-lg transition-colors touch-manipulation ${
                      isPaused ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' : 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800'
                    } text-white`}
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    )}
                  </button>
                  <span className="text-sm text-gray-400 w-8 text-center">
                    {isPaused ? '⏸' : `${countdown}s`}
                  </span>
                </>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  refresh()
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  refresh()
                }}
                className="p-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-lg text-white transition-colors touch-manipulation"
                title="Refresh now"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Camera Feed */}
        <div className="relative bg-black">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}

          {viewMode === 'live' ? (
            isWebRTCLiveMode ? (
              // WebRTC Live Stream (Medium/High quality)
              <div className="relative">
                <WebRTCPlayer
                  cameraId={cameraId}
                  streamType={config.streamType}
                  onStateChange={handleWebRTCStateChange}
                  onError={handleWebRTCError}
                  className="w-full max-h-[70vh]"
                  showDetections={showLiveDetections}
                  detectionRefreshInterval={500}
                  labelMode={labelMode && showLiveDetections}
                  onDetectionClick={handleDetectionClick}
                />
                {isPaused && (
                  <div className="absolute top-3 right-3 bg-yellow-600/90 px-2 py-1 rounded text-xs font-bold text-white">
                    PAUSED
                  </div>
                )}
                {/* Error/warning message */}
                {frameLoadError && (
                  <div className="absolute bottom-3 left-3 right-3 bg-yellow-600/90 px-3 py-2 rounded text-sm text-white flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{frameLoadError}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setFrameLoadError(null)
                      }}
                      className="ml-auto text-white/80 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : isPollingLiveMode ? (
              // Polling-based "live" for fallback when WebRTC fails
              <div className="relative">
                <img
                  key={livePollingKey}
                  src={getSnapshotUrl(cameraId, livePollingKey)}
                  alt={`${cameraId} live stream`}
                  className="w-full max-h-[70vh] object-contain"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
                {/* HD Live indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
                  <span className={`w-2 h-2 rounded-full ${isHdFrameLoading ? 'bg-yellow-500' : 'bg-orange-500'} ${isHdFrameLoading ? '' : 'animate-pulse'}`}></span>
                  <span className="text-xs font-bold text-white">
                    {isHdFrameLoading ? 'LOADING' : webrtcFallbackToMjpeg ? 'FALLBACK' : 'LIVE HD'}
                  </span>
                </div>
                {/* HD Loading spinner overlay */}
                {isHdFrameLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                  </div>
                )}
                {isPaused && (
                  <div className="absolute top-3 right-3 bg-yellow-600/90 px-2 py-1 rounded text-xs font-bold text-white">
                    PAUSED
                  </div>
                )}
                {/* Error/warning message */}
                {frameLoadError && (
                  <div className="absolute bottom-3 left-3 right-3 bg-yellow-600/90 px-3 py-2 rounded text-sm text-white flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{frameLoadError}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setFrameLoadError(null)
                      }}
                      className="ml-auto text-white/80 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // True MJPEG Live Stream (Low quality - Frigate detect stream)
              <div className="relative">
                <img
                  src={getLiveUrl(cameraId, true)}
                  alt={`${cameraId} live stream`}
                  className="w-full max-h-[70vh] object-contain"
                  onError={handleImageError}
                />
                {/* Live indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
                  <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-xs font-bold text-white">LIVE</span>
                </div>
              </div>
            )
          ) : viewMode === 'detection' ? (
            // Snapshot with Frigate's bounding boxes (always use Frigate for bbox overlay)
            <div className="relative">
              <img
                ref={imageRef}
                key={imageKey}
                src={`/frigate/api/${cameraId}/latest.jpg?t=${imageKey}&bbox=1`}
                alt={`${cameraId} detection snapshot`}
                className="w-full max-h-[70vh] object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'contain' }}
              />
            </div>
          ) : (
            // Regular snapshot (quality-aware: go2rtc main stream or Frigate detect stream)
            <div className="relative">
              <img
                ref={snapshotRef}
                key={imageKey}
                src={getSnapshotUrl(cameraId, imageKey)}
                alt={`${cameraId} snapshot`}
                className="w-full max-h-[70vh] object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
              {showSnapshotDetections && (
                <DetectionOverlay
                  cameraId={cameraId}
                  enabled={showSnapshotDetections}
                  refreshInterval={1000}
                  targetRef={snapshotRef}
                  showLegend
                  labelMode={labelMode}
                  onDetectionClick={handleDetectionClick}
                />
              )}
            </div>
          )}
        </div>

        {/* Detection Legend (only for detection mode) */}
        {viewMode === 'detection' && detections.length > 0 && (
          <div className="p-3 bg-gray-700/50 border-t border-gray-700">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-400">Detections:</span>
              {detections.map(det => (
                <div key={det.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: DETECTION_COLORS[det.label] || DETECTION_COLORS.default }}
                  />
                  <span className="text-sm text-white capitalize">
                    {det.label} ({Math.round(det.score * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer with stream info */}
        <div className="p-3 bg-gray-700/30 border-t border-gray-700 flex justify-between items-center text-xs text-gray-500">
          <span>
            {viewMode === 'live'
              ? isWebRTCLiveMode
                ? `WebRTC ${config.streamType === 'main' ? 'Main' : 'Sub'} Stream (${config.resolution})${showLiveDetections ? ' + Detection Overlay' : ''}`
                : isPollingLiveMode
                  ? webrtcFallbackToMjpeg
                    ? `Fallback Polling (${config.resolution} @ ~${Math.round(1000 / pollingInterval)}fps)`
                    : `HD Live (${config.resolution} @ ~${Math.round(1000 / pollingInterval)}fps polling)`
                  : 'MJPEG Stream (720p)'
              : viewMode === 'detection'
                ? 'Snapshot + Detection Overlay'
                : showSnapshotDetections
                  ? `Snapshot (${config.resolution}) + Detection Overlay`
                  : `Snapshot (${config.resolution})`}
          </span>
          <span>Tap outside or press ESC to close</span>
        </div>
      </div>

      {/* Labeling Modal */}
      <LabelingModal
        isOpen={labelingModalOpen}
        detection={selectedDetection}
        cameraId={cameraId}
        imageData={capturedImageData}
        onClose={handleCloseLabelingModal}
        onLabelAsStaff={handleLabelAsStaff}
        onCreateStaff={handleCreateStaff}
        onLabelAsCustomer={handleLabelAsCustomer}
        onLabelAsRegular={handleLabelAsRegular}
        onIgnore={handleIgnoreDetection}
      />
    </div>
  )
}
