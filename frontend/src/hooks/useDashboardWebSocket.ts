/**
 * useDashboardWebSocket - Real-time dashboard updates via WebSocket
 *
 * Replaces polling with push-based updates for:
 * - Occupancy counts (total and per-camera)
 * - Camera status changes
 * - Queue updates
 *
 * Falls back to polling if WebSocket is unavailable.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface OccupancyData {
  total: number
  by_camera: Record<string, number>
  by_zone: Record<string, number>
  timestamp: string
}

interface CameraStatusData {
  camera_id: string
  status: string
  details: Record<string, unknown>
  timestamp: string
}

interface QueueUpdateData {
  zone: string
  count: number
  wait_time: number | null
  timestamp: string
}

export interface AnomalyAlertData {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  person_id?: number
  display_id?: string
  zone?: string
  camera_id?: string
  details?: Record<string, unknown>
}

interface WebSocketMessage {
  type: string
  data: OccupancyData | CameraStatusData | QueueUpdateData | AnomalyAlertData
  timestamp: string
}

interface UseDashboardWebSocketOptions {
  enabled?: boolean
  reconnectInterval?: number
  onOccupancyUpdate?: (data: OccupancyData) => void
  onCameraStatus?: (data: CameraStatusData) => void
  onQueueUpdate?: (data: QueueUpdateData) => void
  onAnomalyAlert?: (data: AnomalyAlertData) => void
}

interface UseDashboardWebSocketReturn {
  occupancy: OccupancyData | null
  anomalies: AnomalyAlertData[]
  isConnected: boolean
  needsPolling: boolean
  connectionCount: number
  lastUpdate: Date | null
  reconnect: () => void
  clearAnomalies: () => void
}

export function useDashboardWebSocket({
  enabled = true,
  reconnectInterval = 3000,
  onOccupancyUpdate,
  onCameraStatus,
  onQueueUpdate,
  onAnomalyAlert,
}: UseDashboardWebSocketOptions = {}): UseDashboardWebSocketReturn {
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyAlertData[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [connectionCount, setConnectionCount] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearAnomalies = useCallback(() => {
    setAnomalies([])
  }, [])

  const connect = useCallback(() => {
    if (!enabled) return

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close()
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WebSocket] Connected to dashboard')
        setIsConnected(true)
        setConnectionCount((c) => c + 1)

        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 30000) // Ping every 30 seconds
      }

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason)
        setIsConnected(false)

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }

        // Attempt to reconnect after delay
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Attempting to reconnect...')
            connect()
          }, reconnectInterval)
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      ws.onmessage = (event) => {
        try {
          // Handle pong response
          if (event.data === 'pong') {
            return
          }

          const message: WebSocketMessage = JSON.parse(event.data)
          setLastUpdate(new Date())

          switch (message.type) {
            case 'occupancy:update': {
              const data = message.data as OccupancyData
              setOccupancy(data)
              onOccupancyUpdate?.(data)
              break
            }
            case 'camera:status': {
              const data = message.data as CameraStatusData
              onCameraStatus?.(data)
              break
            }
            case 'queue:update': {
              const data = message.data as QueueUpdateData
              onQueueUpdate?.(data)
              break
            }
            case 'anomaly:alert': {
              const data = message.data as AnomalyAlertData
              setAnomalies(prev => [data, ...prev].slice(0, 50))
              onAnomalyAlert?.(data)
              // Play sound for high/critical severity
              if (['high', 'critical'].includes(data.severity)) {
                const audio = new Audio('/alert.mp3')
                audio.volume = 0.5
                audio.play().catch(() => {
                  // Ignore autoplay errors
                })
              }
              break
            }
            default:
              console.log('[WebSocket] Unknown message type:', message.type)
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e)
        }
      }

      wsRef.current = ws
    } catch (e) {
      console.error('[WebSocket] Failed to connect:', e)
      setIsConnected(false)
    }
  }, [enabled, reconnectInterval, onOccupancyUpdate, onCameraStatus, onQueueUpdate, onAnomalyAlert])

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    connect()
  }, [connect])

  // Initial connection
  useEffect(() => {
    if (enabled) {
      connect()
    }

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [enabled, connect])

  return {
    occupancy,
    anomalies,
    isConnected,
    needsPolling: !isConnected,
    connectionCount,
    lastUpdate,
    reconnect,
    clearAnomalies,
  }
}

export default useDashboardWebSocket
