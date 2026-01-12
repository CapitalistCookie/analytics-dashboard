import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { getEvents, type Event } from '../api/client'
import { useMqttDetections, type MqttDetection } from '../hooks/useMqttDetections'

const DETECTION_COLORS: Record<string, string> = {
  person: '#22c55e', // green for unknown persons
  staff: '#3b82f6', // blue for recognized staff
  tracked: '#8b5cf6', // purple for tracked persons (with displayId) - fallback
  car: '#eab308', // yellow
  dog: '#f97316', // orange
  cat: '#a855f7', // purple
  motorcycle: '#06b6d4', // cyan
  bicycle: '#ec4899', // pink
  default: '#3b82f6', // blue
}

// Color palette for differentiating tracked persons by displayId
// Each letter (A-Z) gets a distinct color, cycling through for overflow
const PERSON_ID_COLORS: string[] = [
  '#8b5cf6', // purple (A)
  '#f97316', // orange (B)
  '#06b6d4', // cyan (C)
  '#ec4899', // pink (D)
  '#eab308', // yellow (E)
  '#14b8a6', // teal (F)
  '#f43f5e', // rose (G)
  '#84cc16', // lime (H)
  '#a855f7', // violet (I)
  '#fb923c', // amber (J)
  '#22d3ee', // sky (K)
  '#e879f9', // fuchsia (L)
  '#facc15', // gold (M)
  '#2dd4bf', // emerald (N)
  '#fb7185', // red-pink (O)
  '#a3e635', // green-lime (P)
  '#c084fc', // purple-light (Q)
  '#fdba74', // orange-light (R)
  '#67e8f9', // cyan-light (S)
  '#f9a8d4', // pink-light (T)
  '#fde047', // yellow-light (U)
  '#5eead4', // teal-light (V)
  '#fda4af', // rose-light (W)
  '#bef264', // lime-light (X)
  '#d8b4fe', // violet-light (Y)
  '#fed7aa', // amber-light (Z)
]

// Get color for a tracked person based on their displayId (e.g., "A2", "B15")
const getPersonIdColor = (displayId: string | null): string => {
  if (!displayId || displayId.length === 0) return DETECTION_COLORS.tracked
  const letter = displayId.charAt(0).toUpperCase()
  const letterIndex = letter.charCodeAt(0) - 65 // A=0, B=1, etc.
  if (letterIndex >= 0 && letterIndex < PERSON_ID_COLORS.length) {
    return PERSON_ID_COLORS[letterIndex]
  }
  return DETECTION_COLORS.tracked
}

// Exported for use by LabelingModal
export interface Detection {
  id: string
  label: string
  score: number
  box: number[] // [x1, y1, x2, y2] as percentage 0-1
  subLabel: string | null // Face recognition name (staff member)
  subLabelScore: number | null // Face recognition confidence
  // ReID fields
  personId: number | null // Tracked person database ID
  displayId: string | null // Display ID like "A7", "B12"
  isStaff: boolean // Whether identified as staff via ReID
}

export interface DetectionOverlayRef {
  refresh: () => void
}

interface DetectionOverlayProps {
  cameraId: string
  enabled?: boolean
  refreshInterval?: number // ms, default 500ms for polling fallback
  targetRef?: React.RefObject<HTMLVideoElement | HTMLImageElement | null>
  showLegend?: boolean
  className?: string
  useMqtt?: boolean // Use real-time MQTT instead of polling (default: true)
  onMqttStatusChange?: (connected: boolean) => void
  labelMode?: boolean // When true, bounding boxes are clickable
  onDetectionClick?: (detection: Detection, imageData: string | null) => void // Called when a detection box is clicked
}

// Video display geometry accounting for object-contain letterboxing
interface DisplayGeometry {
  containerWidth: number
  containerHeight: number
  displayWidth: number
  displayHeight: number
  offsetX: number
  offsetY: number
}

const DetectionOverlay = forwardRef<DetectionOverlayRef, DetectionOverlayProps>(({
  cameraId,
  enabled = true,
  refreshInterval = 500,
  targetRef,
  showLegend = false,
  className = '',
  useMqtt = true,
  onMqttStatusChange,
  labelMode = false,
  onDetectionClick,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [geometry, setGeometry] = useState<DisplayGeometry | null>(null)
  const [hoveredDetectionId, setHoveredDetectionId] = useState<string | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  // MQTT hook for real-time detections (uses shared singleton connection)
  const {
    getDetectionsForCamera,
    isConnected: mqttConnected,
    permanentlyFailed: mqttFailed,
  } = useMqttDetections({
    cameras: [cameraId],
    enabled: enabled && useMqtt,
    onConnect: () => {
      console.log('[DetectionOverlay] MQTT connected')
      onMqttStatusChange?.(true)
    },
    onDisconnect: () => {
      console.log('[DetectionOverlay] MQTT disconnected')
      onMqttStatusChange?.(false)
    },
    onError: () => {
      console.log('[DetectionOverlay] MQTT error, falling back to polling')
      onMqttStatusChange?.(false)
    },
  })

  // Convert MQTT detections to component format
  const mqttDetections = getDetectionsForCamera(cameraId)
  const shouldUseMqtt = useMqtt && mqttConnected && !mqttFailed

  // Update detections from MQTT when connected
  useEffect(() => {
    if (shouldUseMqtt && enabled) {
      const dets: Detection[] = mqttDetections.map((d: MqttDetection) => ({
        id: d.id,
        label: d.label,
        score: d.score,
        box: d.box,
        subLabel: d.subLabel,
        subLabelScore: d.subLabelScore,
        personId: d.personId,
        displayId: d.displayId,
        isStaff: d.isStaff,
      }))
      setDetections(dets)
    }
  }, [shouldUseMqtt, enabled, mqttDetections])

  // Fetch detections from Frigate API (polling fallback)
  const fetchDetections = useCallback(async () => {
    if (!enabled || shouldUseMqtt) return

    try {
      // Fetch only in-progress (active) events for this camera
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
            subLabelScore: null, // API doesn't return this
            // ReID not available in polling mode
            personId: null,
            displayId: null,
            isStaff: false,
          }
        })

      setDetections(dets)
    } catch (err) {
      console.error('[DetectionOverlay] Failed to fetch detections:', err)
    }
  }, [cameraId, enabled, shouldUseMqtt])

  // Expose refresh method via ref
  useImperativeHandle(ref, () => ({
    refresh: fetchDetections,
  }), [fetchDetections])

  // Periodic detection refresh (only when not using MQTT)
  useEffect(() => {
    if (!enabled) {
      setDetections([])
      return
    }

    // Don't poll if MQTT is working
    if (shouldUseMqtt) return

    // Initial fetch
    fetchDetections()

    // Periodic refresh
    const interval = setInterval(fetchDetections, refreshInterval)
    return () => clearInterval(interval)
  }, [enabled, fetchDetections, refreshInterval, shouldUseMqtt])

  // Update dimensions based on target element
  // For video elements, calculate the actual display area accounting for object-contain
  useEffect(() => {
    if (!targetRef?.current) return

    const calculateGeometry = () => {
      const target = targetRef.current
      if (!target) return

      const containerWidth = target.clientWidth
      const containerHeight = target.clientHeight

      if (containerWidth === 0 || containerHeight === 0) return

      // Set basic dimensions (canvas size)
      setDimensions({ width: containerWidth, height: containerHeight })

      // For video elements, calculate actual display area accounting for object-contain
      if (target instanceof HTMLVideoElement) {
        const videoWidth = target.videoWidth
        const videoHeight = target.videoHeight

        if (videoWidth === 0 || videoHeight === 0) {
          // Video not loaded yet, assume full container
          setGeometry({
            containerWidth,
            containerHeight,
            displayWidth: containerWidth,
            displayHeight: containerHeight,
            offsetX: 0,
            offsetY: 0,
          })
          return
        }

        // Calculate scale factors for object-contain
        const scaleX = containerWidth / videoWidth
        const scaleY = containerHeight / videoHeight
        const scale = Math.min(scaleX, scaleY) // object-contain uses smaller scale

        // Actual displayed size
        const displayWidth = videoWidth * scale
        const displayHeight = videoHeight * scale

        // Offset due to letterboxing (centered)
        const offsetX = (containerWidth - displayWidth) / 2
        const offsetY = (containerHeight - displayHeight) / 2

        setGeometry({
          containerWidth,
          containerHeight,
          displayWidth,
          displayHeight,
          offsetX,
          offsetY,
        })
      } else {
        // For image elements, assume full container (no letterboxing calculation)
        setGeometry({
          containerWidth,
          containerHeight,
          displayWidth: containerWidth,
          displayHeight: containerHeight,
          offsetX: 0,
          offsetY: 0,
        })
      }
    }

    // Initial calculation
    calculateGeometry()

    // For video, also listen to loadedmetadata event and first timeupdate
    const target = targetRef.current
    let firstTimeUpdate = true
    const handleTimeUpdate = () => {
      if (firstTimeUpdate) {
        firstTimeUpdate = false
        calculateGeometry()
      }
    }
    if (target instanceof HTMLVideoElement) {
      target.addEventListener('loadedmetadata', calculateGeometry)
      target.addEventListener('resize', calculateGeometry)
      target.addEventListener('timeupdate', handleTimeUpdate)
    }

    // Create ResizeObserver for target element
    const resizeObserver = new ResizeObserver(calculateGeometry)
    resizeObserver.observe(targetRef.current)

    // Also handle window resize
    window.addEventListener('resize', calculateGeometry)

    return () => {
      if (target instanceof HTMLVideoElement) {
        target.removeEventListener('loadedmetadata', calculateGeometry)
        target.removeEventListener('resize', calculateGeometry)
        target.removeEventListener('timeupdate', handleTimeUpdate)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', calculateGeometry)
    }
  }, [targetRef])

  // Helper: Check if a point (canvas coordinates) is inside a detection box
  const getDetectionAtPoint = useCallback((canvasX: number, canvasY: number): Detection | null => {
    if (!geometry && !dimensions.width) return null

    const geo = geometry || {
      displayWidth: dimensions.width,
      displayHeight: dimensions.height,
      offsetX: 0,
      offsetY: 0,
    }

    // Convert canvas coordinates to normalized 0-1 space
    const normalizedX = (canvasX - geo.offsetX) / geo.displayWidth
    const normalizedY = (canvasY - geo.offsetY) / geo.displayHeight

    // Check each detection (reverse order to get topmost first)
    for (let i = detections.length - 1; i >= 0; i--) {
      const det = detections[i]
      const [x1, y1, x2, y2] = det.box
      if (normalizedX >= x1 && normalizedX <= x2 && normalizedY >= y1 && normalizedY <= y2) {
        return det
      }
    }
    return null
  }, [detections, geometry, dimensions])

  // Helper: Capture face image from the target element (video or image)
  const captureFaceImage = useCallback((detection: Detection): string | null => {
    if (!targetRef?.current || !geometry) return null

    const target = targetRef.current
    const [x1, y1, x2, y2] = detection.box

    // Create a temporary canvas to capture the face region
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return null

    let sourceWidth: number, sourceHeight: number
    if (target instanceof HTMLVideoElement) {
      sourceWidth = target.videoWidth
      sourceHeight = target.videoHeight
    } else {
      sourceWidth = target.naturalWidth || target.width
      sourceHeight = target.naturalHeight || target.height
    }

    // Calculate source coordinates with padding for better face capture
    const padding = 0.1 // 10% padding around detection box
    const boxWidth = x2 - x1
    const boxHeight = y2 - y1
    const paddedX1 = Math.max(0, x1 - boxWidth * padding)
    const paddedY1 = Math.max(0, y1 - boxHeight * padding)
    const paddedX2 = Math.min(1, x2 + boxWidth * padding)
    const paddedY2 = Math.min(1, y2 + boxHeight * padding)

    const srcX = paddedX1 * sourceWidth
    const srcY = paddedY1 * sourceHeight
    const srcW = (paddedX2 - paddedX1) * sourceWidth
    const srcH = (paddedY2 - paddedY1) * sourceHeight

    // Set canvas size to captured region (max 512px for efficiency)
    const maxSize = 512
    const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
    tempCanvas.width = Math.round(srcW * scale)
    tempCanvas.height = Math.round(srcH * scale)

    // Draw the cropped region
    tempCtx.drawImage(
      target,
      srcX, srcY, srcW, srcH,
      0, 0, tempCanvas.width, tempCanvas.height
    )

    // Return as base64 JPEG
    return tempCanvas.toDataURL('image/jpeg', 0.9)
  }, [targetRef, geometry])

  // Mouse event handlers for label mode
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!labelMode) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const detection = getDetectionAtPoint(x, y)
    setHoveredDetectionId(detection?.id || null)

    // Update tooltip position
    if (detection) {
      setTooltipPosition({ x: e.clientX, y: e.clientY })
      setShowTooltip(true)
    } else {
      setShowTooltip(false)
    }
  }, [labelMode, getDetectionAtPoint])

  const handleMouseLeave = useCallback(() => {
    setHoveredDetectionId(null)
    setShowTooltip(false)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!labelMode || !onDetectionClick) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const detection = getDetectionAtPoint(x, y)
    if (detection && detection.label === 'person') {
      const imageData = captureFaceImage(detection)
      onDetectionClick(detection, imageData)
    }
  }, [labelMode, onDetectionClick, getDetectionAtPoint, captureFaceImage])

  // Draw detections on canvas
  useEffect(() => {
    if (!canvasRef.current || !enabled || dimensions.width === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match container
    canvas.width = dimensions.width
    canvas.height = dimensions.height

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Use geometry for proper coordinate transformation, or fall back to full canvas
    const geo = geometry || {
      displayWidth: dimensions.width,
      displayHeight: dimensions.height,
      offsetX: 0,
      offsetY: 0,
    }

    // Draw each detection box
    detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.box
      const isHovered = labelMode && hoveredDetectionId === det.id
      const isPerson = det.label === 'person'

      // Determine color based on identification status:
      // 1. Staff (face or ReID identified) - blue
      // 2. Tracked person with displayId - unique color per person letter
      // 3. Unknown person - green
      const isStaffIdentified = det.label === 'person' && (det.subLabel || det.isStaff)
      const isTracked = det.label === 'person' && det.displayId && !isStaffIdentified

      let color: string
      if (isStaffIdentified) {
        color = DETECTION_COLORS.staff
      } else if (isTracked) {
        color = getPersonIdColor(det.displayId)  // Different color per person ID
      } else {
        color = DETECTION_COLORS[det.label] || DETECTION_COLORS.default
      }

      // Convert normalized coordinates (0-1) to canvas coordinates
      // Account for letterboxing offset and actual display size
      const canvasX1 = geo.offsetX + (x1 * geo.displayWidth)
      const canvasY1 = geo.offsetY + (y1 * geo.displayHeight)
      const canvasX2 = geo.offsetX + (x2 * geo.displayWidth)
      const canvasY2 = geo.offsetY + (y2 * geo.displayHeight)
      const width = canvasX2 - canvasX1
      const height = canvasY2 - canvasY1

      // Draw glow effect when hovered in label mode
      if (isHovered && isPerson) {
        ctx.save()
        ctx.shadowColor = color
        ctx.shadowBlur = 15
        ctx.strokeStyle = color
        ctx.lineWidth = 4
        ctx.strokeRect(canvasX1, canvasY1, width, height)
        ctx.restore()
      }

      // Draw bounding box
      ctx.strokeStyle = color
      ctx.lineWidth = isHovered ? 4 : 3
      ctx.strokeRect(canvasX1, canvasY1, width, height)

      // In label mode, draw a subtle fill for person boxes
      if (labelMode && isPerson) {
        ctx.fillStyle = isHovered ? `${color}30` : `${color}10`
        ctx.fillRect(canvasX1, canvasY1, width, height)
      }

      // Format label based on identification:
      // 1. Staff - show name
      // 2. Tracked person - show display ID (e.g., "Person A7")
      // 3. Unknown - show label with score
      let label: string
      if (isStaffIdentified && det.subLabel && typeof det.subLabel === 'string') {
        // Format staff name nicely (convert john_smith to John Smith)
        const staffName = det.subLabel
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
        const confidence = det.subLabelScore
          ? ` ${Math.round(det.subLabelScore * 100)}%`
          : ''
        label = `${staffName}${confidence}`
      } else if (isTracked && det.displayId) {
        // Show tracked person display ID
        label = `Person ${det.displayId}`
      } else if (det.displayId) {
        // Staff identified via ReID but no face name
        label = `Staff ${det.displayId}`
      } else {
        label = `${det.label} ${Math.round(det.score * 100)}%`
      }

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
  }, [detections, dimensions, geometry, enabled, labelMode, hoveredDetectionId])

  if (!enabled) return null

  // Determine if we're hovering over a clickable person
  const hoveredDetection = detections.find(d => d.id === hoveredDetectionId)
  const isHoveringPerson = hoveredDetection?.label === 'person'

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${labelMode ? 'pointer-events-auto' : 'pointer-events-none'} ${className}`}
        style={{
          width: dimensions.width || '100%',
          height: dimensions.height || '100%',
          zIndex: 10, // Ensure canvas is above video element
          cursor: labelMode && isHoveringPerson ? 'pointer' : 'default',
        }}
        onMouseMove={labelMode ? handleMouseMove : undefined}
        onMouseLeave={labelMode ? handleMouseLeave : undefined}
        onClick={labelMode ? handleClick : undefined}
      />
      {/* Tooltip for label mode */}
      {labelMode && showTooltip && isHoveringPerson && (
        <div
          className="fixed z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg pointer-events-none"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
          }}
        >
          Click to label this person
        </div>
      )}
      {showLegend && (detections.length > 0 || shouldUseMqtt) && (
        <div className="absolute bottom-2 left-2 bg-black/70 rounded px-2 py-1">
          <div className="flex flex-wrap gap-2 items-center">
            {/* MQTT status indicator */}
            {useMqtt && (
              <div className="flex items-center gap-1 text-xs mr-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    shouldUseMqtt ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                  }`}
                />
                <span className="text-gray-300">
                  {shouldUseMqtt ? 'MQTT' : 'Polling'}
                </span>
              </div>
            )}
            {detections.map(det => {
              // Determine color (same logic as drawing)
              const isStaffIdentified = det.label === 'person' && (det.subLabel || det.isStaff)
              const isTracked = det.label === 'person' && det.displayId && !isStaffIdentified

              let color: string
              if (isStaffIdentified) {
                color = DETECTION_COLORS.staff
              } else if (isTracked) {
                color = getPersonIdColor(det.displayId)  // Different color per person ID
              } else {
                color = DETECTION_COLORS[det.label] || DETECTION_COLORS.default
              }

              // Format display text (same logic as drawing)
              let displayText: string
              if (isStaffIdentified && det.subLabel && typeof det.subLabel === 'string') {
                const staffName = det.subLabel
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')
                const confidence = det.subLabelScore
                  ? ` ${Math.round(det.subLabelScore * 100)}%`
                  : ''
                displayText = `${staffName}${confidence}`
              } else if (isTracked && det.displayId) {
                displayText = `Person ${det.displayId}`
              } else if (det.displayId) {
                displayText = `Staff ${det.displayId}`
              } else {
                displayText = `${det.label} ${Math.round(det.score * 100)}%`
              }

              return (
                <div key={det.id} className="flex items-center gap-1 text-xs">
                  <div
                    className="w-2 h-2 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-white capitalize">
                    {displayText}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
})

DetectionOverlay.displayName = 'DetectionOverlay'

export default DetectionOverlay
