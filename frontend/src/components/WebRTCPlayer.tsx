import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import DetectionOverlay, { type DetectionOverlayRef, type Detection } from './DetectionOverlay'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed'

export interface WebRTCPlayerRef {
  videoElement: HTMLVideoElement | null
}

interface WebRTCPlayerProps {
  cameraId: string
  streamType?: 'main' | 'sub'  // main = high quality, sub = lower quality sub-stream
  onStateChange?: (state: ConnectionState) => void
  onError?: (error: string) => void
  className?: string
  muted?: boolean
  autoPlay?: boolean
  showDetections?: boolean  // Enable detection bounding box overlay
  detectionRefreshInterval?: number  // Detection refresh rate in ms (default 500)
  labelMode?: boolean  // Enable click-to-label on detection boxes
  onDetectionClick?: (detection: Detection, imageData: string | null) => void
}

// ICE servers for WebRTC
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

// Reconnect delay after failure
const RECONNECT_DELAY = 2000

// Connection timeout
const CONNECTION_TIMEOUT = 10000

// If WebSocket closes within this time, it's likely a rejection
const IMMEDIATE_CLOSE_THRESHOLD = 1500

const WebRTCPlayer = forwardRef<WebRTCPlayerRef, WebRTCPlayerProps>(({
  cameraId,
  streamType = 'main',
  onStateChange,
  onError,
  className = '',
  muted = true,
  autoPlay = true,
  showDetections = false,
  detectionRefreshInterval = 500,
  labelMode = false,
  onDetectionClick,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectionRef = useRef<DetectionOverlayRef>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const connectionTimeoutRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [retryCount, setRetryCount] = useState(0)
  const wsOpenTimeRef = useRef<number>(0)


  // Expose video element to parent via ref
  useImperativeHandle(ref, () => ({
    videoElement: videoRef.current,
  }), [])

  // Update connection state and notify parent
  const updateState = useCallback((state: ConnectionState) => {
    if (!mountedRef.current) return
    setConnectionState(state)
    onStateChange?.(state)
  }, [onStateChange])

  // Handle errors
  const handleError = useCallback((error: string) => {
    console.error('WebRTC Error:', error)
    onError?.(error)
  }, [onError])

  // Clean up WebRTC and WebSocket connections
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Connect to go2rtc WebRTC
  const connect = useCallback(() => {
    if (!mountedRef.current) return

    cleanup()
    updateState('connecting')

    // Determine stream source - use sub-stream suffix if requested
    const streamSrc = streamType === 'sub' ? `${cameraId}_sub` : cameraId

    // Build WebSocket URL for go2rtc
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/go2rtc/api/ws?src=${encodeURIComponent(streamSrc)}`

    console.log('WebRTC connecting to:', wsUrl)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    wsOpenTimeRef.current = Date.now()

    // Connection timeout
    connectionTimeoutRef.current = window.setTimeout(() => {
      if (connectionState === 'connecting') {
        handleError('Connection timeout')
        updateState('failed')
        cleanup()

        // Attempt reconnect (max 2 retries)
        if (mountedRef.current && retryCount < 2) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            setRetryCount(prev => prev + 1)
            connect()
          }, RECONNECT_DELAY)
        }
      }
    }, CONNECTION_TIMEOUT)

    ws.onopen = () => {
      if (!mountedRef.current) return
      console.log('WebSocket connected, creating RTCPeerConnection')

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        bundlePolicy: 'max-bundle',
      })
      pcRef.current = pc

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (!event.candidate) return
        const candidate = event.candidate.toJSON().candidate
        if (candidate) {
          ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }))
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('RTCPeerConnection state:', pc.connectionState)

        if (pc.connectionState === 'connected') {
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current)
            connectionTimeoutRef.current = null
          }
          updateState('connected')
          setRetryCount(0)  // Reset retry count on successful connection
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          updateState('failed')

          // Attempt reconnect (max 2 retries)
          if (mountedRef.current && retryCount < 2) {
            reconnectTimeoutRef.current = window.setTimeout(() => {
              setRetryCount(prev => prev + 1)
              connect()
            }, RECONNECT_DELAY)
          }
        }
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('Received track:', event.track.kind)
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0]
        }
      }

      // Add transceivers for receiving video and audio
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      // Create and send offer
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) {
            ws.send(JSON.stringify({
              type: 'webrtc/offer',
              value: pc.localDescription.sdp,
            }))
          }
        })
        .catch(err => {
          console.error('Error creating offer:', err)
          handleError('Failed to create WebRTC offer')
        })
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return

      try {
        const msg = JSON.parse(event.data)
        const pc = pcRef.current

        if (!pc) return

        switch (msg.type) {
          case 'webrtc/answer':
            pc.setRemoteDescription({ type: 'answer', sdp: msg.value })
              .catch(err => {
                console.error('Error setting remote description:', err)
                handleError('Failed to set WebRTC answer')
              })
            break

          case 'webrtc/candidate':
            if (msg.value) {
              pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' })
                .catch(err => {
                  // ICE candidate errors are often non-fatal
                  console.warn('Error adding ICE candidate:', err)
                })
            }
            break

          case 'error':
            console.error('go2rtc error:', msg.value)
            handleError(msg.value)
            break
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    ws.onerror = (event) => {
      console.error('WebSocket error:', event)
      handleError('WebSocket connection error')
    }

    ws.onclose = () => {
      const closeTime = Date.now() - wsOpenTimeRef.current
      const wasImmediateClose = closeTime < IMMEDIATE_CLOSE_THRESHOLD
      console.log(`WebSocket closed after ${closeTime}ms (immediate: ${wasImmediateClose})`)

      if (mountedRef.current && connectionState === 'connecting') {
        updateState('failed')

        // If WebSocket closed immediately, likely rejected - don't retry as many times
        const maxRetries = wasImmediateClose ? 1 : 2

        if (retryCount < maxRetries) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            setRetryCount(prev => prev + 1)
            connect()
          }, wasImmediateClose ? RECONNECT_DELAY / 2 : RECONNECT_DELAY)
        }
      }
    }
  }, [cameraId, streamType, connectionState, retryCount, cleanup, updateState, handleError])

  // Initialize connection on mount
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cameraId, streamType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle video play on user interaction (autoplay policy)
  const handleVideoClick = () => {
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(console.warn)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        onClick={handleVideoClick}
        className="w-full h-full object-contain bg-black"
      />

      {/* Connection status indicator */}
      {connectionState !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          {connectionState === 'connecting' && (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-white text-sm">Connecting WebRTC...</span>
              {retryCount > 0 && (
                <span className="text-gray-400 text-xs">Retry {retryCount}/2</span>
              )}
            </div>
          )}
          {connectionState === 'failed' && (
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-white text-sm">Connection failed</span>
              {retryCount < 2 ? (
                <span className="text-gray-400 text-xs">Retrying...</span>
              ) : (
                <button
                  onClick={() => {
                    setRetryCount(0)
                    connect()
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {connectionState === 'disconnected' && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-gray-400 text-sm">Disconnected</span>
            </div>
          )}
        </div>
      )}

      {/* Detection overlay */}
      {showDetections && connectionState === 'connected' && (
        <DetectionOverlay
          ref={detectionRef}
          cameraId={cameraId}
          enabled={showDetections}
          refreshInterval={detectionRefreshInterval}
          targetRef={videoRef}
          showLegend
          labelMode={labelMode}
          onDetectionClick={onDetectionClick}
        />
      )}

      {/* Live indicator when connected */}
      {connectionState === 'connected' && (
        <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
          <span className="animate-pulse w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-xs font-bold text-white">
            {showDetections ? 'WebRTC + Detection' : 'WebRTC'}
          </span>
        </div>
      )}
    </div>
  )
})

WebRTCPlayer.displayName = 'WebRTCPlayer'

export default WebRTCPlayer
