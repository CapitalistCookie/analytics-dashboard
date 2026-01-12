import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react'

// Maximum concurrent WebRTC connections to avoid overwhelming the browser/server
const MAX_WEBRTC_CONNECTIONS = 6

interface WebRTCConnection {
  cameraId: string
  priority: number  // Lower = higher priority (based on visibility order)
  requestedAt: number
}

interface WebRTCConnectionManagerContextType {
  // Request a WebRTC connection slot for a camera
  // Returns true if the camera should use WebRTC, false if it should fall back
  requestConnection: (cameraId: string, priority: number) => boolean

  // Release a connection when component unmounts or camera is no longer visible
  releaseConnection: (cameraId: string) => void

  // Check if a camera currently has a WebRTC slot
  hasConnection: (cameraId: string) => boolean

  // Get current number of active connections
  activeConnections: number

  // Get max connections
  maxConnections: number
}

const WebRTCConnectionManagerContext = createContext<WebRTCConnectionManagerContextType | undefined>(undefined)

export function WebRTCConnectionManagerProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<Map<string, WebRTCConnection>>(new Map())
  const connectionsRef = useRef(connections)

  // Keep ref in sync with state for callbacks
  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  const requestConnection = useCallback((cameraId: string, priority: number): boolean => {
    const current = connectionsRef.current

    // Already has a connection
    if (current.has(cameraId)) {
      // Update priority if needed
      const existing = current.get(cameraId)!
      if (existing.priority !== priority) {
        setConnections(prev => {
          const next = new Map(prev)
          next.set(cameraId, { ...existing, priority })
          return next
        })
      }
      return true
    }

    // Room for more connections
    if (current.size < MAX_WEBRTC_CONNECTIONS) {
      setConnections(prev => {
        const next = new Map(prev)
        next.set(cameraId, {
          cameraId,
          priority,
          requestedAt: Date.now(),
        })
        return next
      })
      return true
    }

    // No room - check if this camera has higher priority than existing ones
    const sortedConnections = Array.from(current.values())
      .sort((a, b) => a.priority - b.priority)

    // Find the lowest priority connection
    const lowestPriority = sortedConnections[sortedConnections.length - 1]

    // If this camera has higher priority (lower number), evict the lowest priority
    if (priority < lowestPriority.priority) {
      setConnections(prev => {
        const next = new Map(prev)
        next.delete(lowestPriority.cameraId)
        next.set(cameraId, {
          cameraId,
          priority,
          requestedAt: Date.now(),
        })
        return next
      })
      return true
    }

    // This camera has lower priority, deny the connection
    return false
  }, [])

  const releaseConnection = useCallback((cameraId: string) => {
    setConnections(prev => {
      if (!prev.has(cameraId)) return prev
      const next = new Map(prev)
      next.delete(cameraId)
      return next
    })
  }, [])

  const hasConnection = useCallback((cameraId: string): boolean => {
    return connectionsRef.current.has(cameraId)
  }, [])

  return (
    <WebRTCConnectionManagerContext.Provider
      value={{
        requestConnection,
        releaseConnection,
        hasConnection,
        activeConnections: connections.size,
        maxConnections: MAX_WEBRTC_CONNECTIONS,
      }}
    >
      {children}
    </WebRTCConnectionManagerContext.Provider>
  )
}

export function useWebRTCConnectionManager() {
  const context = useContext(WebRTCConnectionManagerContext)
  if (context === undefined) {
    throw new Error('useWebRTCConnectionManager must be used within a WebRTCConnectionManagerProvider')
  }
  return context
}
