import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type StreamQuality = 'low' | 'medium' | 'high'

interface QualityConfig {
  label: string
  description: string
  snapshotEndpoint: 'frigate' | 'go2rtc'  // frigate = detect stream, go2rtc = main stream
  jpegQuality: number  // 1-100 for go2rtc, ignored for frigate
  liveEndpoint: 'frigate' | 'go2rtc'  // which service for MJPEG live
  liveMode: 'mjpeg' | 'polling' | 'webrtc'  // mjpeg = MJPEG stream, polling = rapid frame refresh, webrtc = WebRTC stream
  streamType: 'main' | 'sub'  // which stream to use for WebRTC
  resolution: string  // for display
}

export const QUALITY_CONFIGS: Record<StreamQuality, QualityConfig> = {
  low: {
    label: 'Low',
    description: 'MJPEG stream (720p detect stream)',
    snapshotEndpoint: 'frigate',
    jpegQuality: 70,
    liveEndpoint: 'frigate',
    liveMode: 'mjpeg',  // Frigate MJPEG works well for low quality
    streamType: 'sub',
    resolution: '1280×720',
  },
  medium: {
    label: 'Medium',
    description: 'WebRTC sub-stream (smooth, lower bandwidth)',
    snapshotEndpoint: 'go2rtc',
    jpegQuality: 70,
    liveEndpoint: 'go2rtc',
    liveMode: 'webrtc',  // WebRTC for smooth live video
    streamType: 'sub',  // Sub-stream for medium quality
    resolution: '1280×720',
  },
  high: {
    label: 'High',
    description: 'WebRTC main stream (full quality)',
    snapshotEndpoint: 'go2rtc',
    jpegQuality: 85,
    liveEndpoint: 'go2rtc',
    liveMode: 'webrtc',  // WebRTC for smooth live video
    streamType: 'main',  // Main stream for high quality
    resolution: '2560×1440',
  },
}

interface StreamQualityContextType {
  quality: StreamQuality
  setQuality: (quality: StreamQuality) => void
  config: QualityConfig
  getSnapshotUrl: (cameraId: string, timestamp?: number) => string
  getLiveUrl: (cameraId: string, withBbox?: boolean) => string
  getFallbackUrl: (cameraId: string, timestamp?: number) => string  // Always uses reliable Frigate snapshots
}

const StreamQualityContext = createContext<StreamQualityContextType | undefined>(undefined)

export function StreamQualityProvider({ children }: { children: ReactNode }) {
  const [quality, setQualityState] = useState<StreamQuality>(() => {
    const saved = localStorage.getItem('streamQuality')
    return (saved as StreamQuality) || 'medium'
  })

  useEffect(() => {
    localStorage.setItem('streamQuality', quality)
  }, [quality])

  const setQuality = (newQuality: StreamQuality) => {
    setQualityState(newQuality)
  }

  const config = QUALITY_CONFIGS[quality]

  const getSnapshotUrl = (cameraId: string, timestamp?: number): string => {
    const t = timestamp || Date.now()

    if (config.snapshotEndpoint === 'go2rtc') {
      // Use go2rtc for main stream access with quality control
      return `/go2rtc/api/frame.jpeg?src=${cameraId}&quality=${config.jpegQuality}&t=${t}`
    } else {
      // Use Frigate's detect stream (lower resolution but faster)
      return `/frigate/api/${cameraId}/latest.jpg?t=${t}`
    }
  }

  const getLiveUrl = (cameraId: string, withBbox: boolean = false): string => {
    if (config.liveEndpoint === 'go2rtc') {
      // go2rtc MJPEG stream from main camera (no bbox support)
      return `/go2rtc/api/stream.mjpeg?src=${cameraId}`
    } else {
      // Frigate MJPEG with optional bounding boxes
      return `/frigate/api/${cameraId}${withBbox ? '?bbox=1' : ''}`
    }
  }

  // Always use Frigate's reliable snapshot endpoint for fallback
  // This works reliably even when go2rtc frame.jpeg fails (H.265 decode issues)
  const getFallbackUrl = (cameraId: string, timestamp?: number): string => {
    const t = timestamp || Date.now()
    return `/frigate/api/${cameraId}/latest.jpg?h=480&t=${t}`
  }

  return (
    <StreamQualityContext.Provider value={{ quality, setQuality, config, getSnapshotUrl, getLiveUrl, getFallbackUrl }}>
      {children}
    </StreamQualityContext.Provider>
  )
}

export function useStreamQuality() {
  const context = useContext(StreamQualityContext)
  if (context === undefined) {
    throw new Error('useStreamQuality must be used within a StreamQualityProvider')
  }
  return context
}
