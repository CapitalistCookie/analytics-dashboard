import { useEffect, useState, useCallback } from 'react'
import { mqttManager, type MqttDetection } from '../services/mqttClient'

// Re-export the type for consumers
export type { MqttDetection }

interface UseMqttDetectionsOptions {
  cameras?: string[] // Filter for specific cameras (empty = all)
  enabled?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

interface UseMqttDetectionsResult {
  detections: Map<string, MqttDetection[]> // camera -> detections
  isConnected: boolean
  error: string | null
  permanentlyFailed: boolean
  getDetectionsForCamera: (camera: string) => MqttDetection[]
}

/**
 * Hook to access MQTT detections from the shared connection manager.
 * All instances share a single MQTT connection to avoid resource exhaustion.
 */
export function useMqttDetections(options: UseMqttDetectionsOptions = {}): UseMqttDetectionsResult {
  const { cameras = [], enabled = true, onConnect, onDisconnect, onError } = options

  const [detections, setDetections] = useState<Map<string, MqttDetection[]>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permanentlyFailed, setPermanentlyFailed] = useState(false)

  // Subscribe to status changes
  useEffect(() => {
    if (!enabled) {
      setIsConnected(false)
      return
    }

    const unsubscribe = mqttManager.subscribeToStatus((connected, err) => {
      const status = mqttManager.getStatus()

      setIsConnected(connected)
      setError(err || null)
      setPermanentlyFailed(status.permanentlyFailed)

      if (connected) {
        onConnect?.()
      } else {
        onDisconnect?.()
        if (err) {
          onError?.(new Error(err))
        }
      }
    })

    return unsubscribe
  }, [enabled, onConnect, onDisconnect, onError])

  // Subscribe to detection updates
  useEffect(() => {
    if (!enabled) {
      setDetections(new Map())
      return
    }

    const unsubscribe = mqttManager.subscribeToDetections((allDetections) => {
      // Filter by cameras if specified
      if (cameras.length > 0) {
        const filtered = new Map<string, MqttDetection[]>()
        cameras.forEach(camera => {
          const cameraDetections = allDetections.get(camera)
          if (cameraDetections) {
            filtered.set(camera, cameraDetections)
          }
        })
        setDetections(filtered)
      } else {
        setDetections(allDetections)
      }
    })

    return unsubscribe
  }, [enabled, cameras.join(',')])

  // Helper to get detections for a specific camera
  const getDetectionsForCamera = useCallback((camera: string): MqttDetection[] => {
    return detections.get(camera) || []
  }, [detections])

  return {
    detections,
    isConnected,
    error,
    permanentlyFailed,
    getDetectionsForCamera,
  }
}

export default useMqttDetections
