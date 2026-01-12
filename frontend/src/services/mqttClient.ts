/**
 * Singleton MQTT Client Manager
 *
 * Provides a single shared MQTT connection for the entire application.
 * All components subscribe through this manager instead of creating their own connections.
 */

import mqtt, { MqttClient } from 'mqtt'

// Detection from MQTT with normalized coordinates
export interface MqttDetection {
  id: string
  camera: string
  label: string
  score: number
  box: number[] // [x1, y1, x2, y2] normalized 0-1
  active: boolean
  frameTime: number
  subLabel: string | null // Face recognition name
  subLabelScore: number | null // Face recognition confidence
  // ReID fields
  personId: number | null // Tracked person ID
  displayId: string | null // Display ID like "A7", "B12"
  isStaff: boolean // Whether identified as staff via ReID
}

// Raw MQTT event structure from Frigate
interface FrigateEventPayload {
  before: FrigateEventData
  after: FrigateEventData
  type: 'new' | 'update' | 'end'
}

interface FrigateEventData {
  id: string
  camera: string
  label: string
  score: number
  box: number[] // [x1, y1, x2, y2] in pixels
  region: number[] // [x1, y1, x2, y2] detection region in pixels
  active: boolean
  false_positive: boolean
  frame_time: number
  end_time: number | null
  sub_label: string | null // Face recognition name
  sub_label_score: number | null // Face recognition confidence
}

// ReID enriched event from analytics backend
interface ReIDEvent {
  camera_id: string
  frigate_id: string
  person_id: number
  display_id: string
  is_staff: boolean
  staff_name: string | null
  similarity: number
  zone: string
  is_cross_camera: boolean
  timestamp: string
}

// Journey update from analytics backend
export interface JourneyUpdate {
  person_id: number
  display_id: string
  current_camera: string | null
  current_zone: string | null
  is_staff: boolean
  journey: {
    camera: string
    zone: string
    enter: string
    exit: string | null
    dwell_seconds?: number | null
  }[]
  total_duration: string
  first_seen: string | null
  last_seen: string | null
  timestamp: string
}

// Frigate detect stream resolution (from config.yml: detect.width/height)
// All cameras use the same detect resolution
const DETECT_RESOLUTION = { width: 1920, height: 1080 }

function getResolution(_camera: string, _region?: number[]): { width: number; height: number } {
  // Use the configured detect resolution for all cameras
  // The box coordinates from MQTT are in the detect frame's coordinate space
  // Do NOT use region for inference as it can extend beyond frame bounds due to padding
  return DETECT_RESOLUTION
}

type DetectionCallback = (detections: Map<string, MqttDetection[]>) => void
type StatusCallback = (connected: boolean, error?: string) => void
type JourneyCallback = (journeys: Map<string, JourneyUpdate>) => void

class MqttConnectionManager {
  private client: MqttClient | null = null
  private isConnected = false
  private connectionError: string | null = null
  private retryCount = 0
  private maxRetries = 3
  private retryTimeout: ReturnType<typeof setTimeout> | null = null

  // Detection storage: camera -> (id -> detection)
  private detections: Map<string, Map<string, MqttDetection>> = new Map()

  // Journey storage: display_id -> journey update
  private journeys: Map<string, JourneyUpdate> = new Map()

  // Subscribers
  private detectionSubscribers: Set<DetectionCallback> = new Set()
  private statusSubscribers: Set<StatusCallback> = new Set()
  private journeySubscribers: Set<JourneyCallback> = new Set()

  // Track if we've given up on MQTT
  private permanentlyFailed = false

  constructor() {
    // Auto-connect on first import if in browser
    if (typeof window !== 'undefined') {
      this.connect()
    }
  }

  private getWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/mqtt/`
  }

  private connect(): void {
    if (this.client || this.permanentlyFailed) {
      return
    }

    const wsUrl = this.getWsUrl()
    console.log('[MqttManager] Connecting to:', wsUrl)

    try {
      this.client = mqtt.connect(wsUrl, {
        protocolVersion: 4,
        reconnectPeriod: 0, // We handle reconnection ourselves
        connectTimeout: 10000,
        keepalive: 30,
        clientId: `dashboard_${Math.random().toString(16).substring(2, 10)}`,
      })

      this.client.on('connect', this.handleConnect)
      this.client.on('message', this.handleMessage)
      this.client.on('error', this.handleError)
      this.client.on('close', this.handleClose)
    } catch (err) {
      console.error('[MqttManager] Failed to create connection:', err)
      this.scheduleRetry()
    }
  }

  private handleConnect = (): void => {
    console.log('[MqttManager] Connected')
    this.isConnected = true
    this.connectionError = null
    this.retryCount = 0

    this.client?.subscribe('frigate/events', (err) => {
      if (err) {
        console.error('[MqttManager] Subscribe error:', err)
        this.connectionError = 'Failed to subscribe'
        this.notifyStatusSubscribers()
      } else {
        console.log('[MqttManager] Subscribed to frigate/events')
      }
    })

    // Subscribe to ReID enriched events
    this.client?.subscribe('analytics/reid/#', (err) => {
      if (err) {
        console.error('[MqttManager] ReID subscribe error:', err)
      } else {
        console.log('[MqttManager] Subscribed to analytics/reid/#')
      }
    })

    // Subscribe to journey updates
    this.client?.subscribe('analytics/journey/#', (err) => {
      if (err) {
        console.error('[MqttManager] Journey subscribe error:', err)
      } else {
        console.log('[MqttManager] Subscribed to analytics/journey/#')
      }
    })

    this.notifyStatusSubscribers()
  }

  private handleMessage = (topic: string, message: Buffer): void => {
    try {
      const topicStr = topic.toString()

      // Handle ReID enriched events
      if (topicStr.startsWith('analytics/reid/')) {
        this.handleReIDMessage(message)
        return
      }

      // Handle journey updates
      if (topicStr.startsWith('analytics/journey/')) {
        this.handleJourneyMessage(message)
        return
      }

      const payload: FrigateEventPayload = JSON.parse(message.toString())
      const event = payload.after

      // Skip false positives
      if (event.false_positive) return

      // Get or create camera detection map
      if (!this.detections.has(event.camera)) {
        this.detections.set(event.camera, new Map())
      }
      const cameraDetections = this.detections.get(event.camera)!

      if (payload.type === 'end' || event.end_time !== null) {
        // Remove ended detection
        cameraDetections.delete(event.id)
      } else {
        // Add or update detection
        const resolution = getResolution(event.camera, event.region)

        // Normalize box coordinates from pixels to 0-1
        const [x1, y1, x2, y2] = event.box
        const normalizedBox = [
          x1 / resolution.width,
          y1 / resolution.height,
          x2 / resolution.width,
          y2 / resolution.height,
        ]

        // Preserve existing ReID data if present
        const existingDetection = cameraDetections.get(event.id)

        const detection: MqttDetection = {
          id: event.id,
          camera: event.camera,
          label: event.label,
          score: event.score,
          box: normalizedBox,
          active: event.active,
          frameTime: event.frame_time,
          subLabel: event.sub_label || null,
          subLabelScore: event.sub_label_score || null,
          // Preserve ReID data from previous update or set defaults
          personId: existingDetection?.personId ?? null,
          displayId: existingDetection?.displayId ?? null,
          isStaff: existingDetection?.isStaff ?? false,
        }

        cameraDetections.set(event.id, detection)
      }

      // Notify all detection subscribers
      this.notifyDetectionSubscribers()
    } catch (err) {
      console.error('[MqttManager] Failed to parse message:', err)
    }
  }

  private handleReIDMessage = (message: Buffer): void => {
    try {
      const reidEvent: ReIDEvent = JSON.parse(message.toString())

      // Find the detection and update with ReID info
      const cameraDetections = this.detections.get(reidEvent.camera_id)
      if (!cameraDetections) return

      const detection = cameraDetections.get(reidEvent.frigate_id)
      if (!detection) return

      // Update detection with ReID info
      detection.personId = reidEvent.person_id
      detection.displayId = reidEvent.display_id
      detection.isStaff = reidEvent.is_staff

      // If ReID identified as staff, update subLabel if not already set by face recognition
      if (reidEvent.is_staff && reidEvent.staff_name && !detection.subLabel) {
        detection.subLabel = reidEvent.staff_name
        detection.subLabelScore = reidEvent.similarity
      }

      cameraDetections.set(reidEvent.frigate_id, detection)
      this.notifyDetectionSubscribers()
    } catch (err) {
      console.error('[MqttManager] Failed to parse ReID message:', err)
    }
  }

  private handleJourneyMessage = (message: Buffer): void => {
    try {
      const journeyUpdate: JourneyUpdate = JSON.parse(message.toString())

      // Store journey by display_id
      this.journeys.set(journeyUpdate.display_id, journeyUpdate)

      // Clean up old journeys (inactive for more than 10 minutes)
      const now = new Date()
      this.journeys.forEach((journey, displayId) => {
        if (journey.last_seen) {
          const lastSeen = new Date(journey.last_seen)
          const ageMs = now.getTime() - lastSeen.getTime()
          if (ageMs > 10 * 60 * 1000) {
            this.journeys.delete(displayId)
          }
        }
      })

      this.notifyJourneySubscribers()
    } catch (err) {
      console.error('[MqttManager] Failed to parse journey message:', err)
    }
  }

  private notifyJourneySubscribers(): void {
    this.journeySubscribers.forEach(callback => {
      try {
        callback(new Map(this.journeys))
      } catch (err) {
        console.error('[MqttManager] Journey subscriber error:', err)
      }
    })
  }

  private handleError = (err: Error): void => {
    console.error('[MqttManager] Error:', err)
    this.connectionError = err.message
    this.notifyStatusSubscribers()
  }

  private handleClose = (): void => {
    console.log('[MqttManager] Disconnected')
    this.isConnected = false
    this.client = null
    this.notifyStatusSubscribers()
    this.scheduleRetry()
  }

  private scheduleRetry(): void {
    if (this.retryTimeout || this.permanentlyFailed) {
      return
    }

    if (this.retryCount >= this.maxRetries) {
      console.log('[MqttManager] Max retries reached, falling back to polling')
      this.permanentlyFailed = true
      this.connectionError = 'Max retries exceeded - using polling fallback'
      this.notifyStatusSubscribers()

      // Schedule a background reconnection attempt every 60 seconds
      setTimeout(() => {
        console.log('[MqttManager] Background reconnection attempt...')
        this.permanentlyFailed = false
        this.retryCount = 0
        this.connect()
      }, 60000)
      return
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, this.retryCount) * 1000
    console.log(`[MqttManager] Retry ${this.retryCount + 1}/${this.maxRetries} in ${delay}ms`)

    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null
      this.retryCount++
      this.connect()
    }, delay)
  }

  private notifyDetectionSubscribers(): void {
    const detectionsMap = new Map<string, MqttDetection[]>()
    this.detections.forEach((cameraDetections, camera) => {
      detectionsMap.set(camera, Array.from(cameraDetections.values()))
    })

    this.detectionSubscribers.forEach(callback => {
      try {
        callback(detectionsMap)
      } catch (err) {
        console.error('[MqttManager] Subscriber error:', err)
      }
    })
  }

  private notifyStatusSubscribers(): void {
    this.statusSubscribers.forEach(callback => {
      try {
        callback(this.isConnected, this.connectionError || undefined)
      } catch (err) {
        console.error('[MqttManager] Status subscriber error:', err)
      }
    })
  }

  // Public API

  /**
   * Subscribe to detection updates
   */
  subscribeToDetections(callback: DetectionCallback): () => void {
    this.detectionSubscribers.add(callback)

    // Immediately send current state
    const detectionsMap = new Map<string, MqttDetection[]>()
    this.detections.forEach((cameraDetections, camera) => {
      detectionsMap.set(camera, Array.from(cameraDetections.values()))
    })
    callback(detectionsMap)

    // Return unsubscribe function
    return () => {
      this.detectionSubscribers.delete(callback)
    }
  }

  /**
   * Subscribe to connection status changes
   */
  subscribeToStatus(callback: StatusCallback): () => void {
    this.statusSubscribers.add(callback)

    // Immediately send current status
    callback(this.isConnected, this.connectionError || undefined)

    // Return unsubscribe function
    return () => {
      this.statusSubscribers.delete(callback)
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): { connected: boolean; error: string | null; permanentlyFailed: boolean } {
    return {
      connected: this.isConnected,
      error: this.connectionError,
      permanentlyFailed: this.permanentlyFailed,
    }
  }

  /**
   * Get detections for a specific camera
   */
  getDetectionsForCamera(camera: string): MqttDetection[] {
    const cameraDetections = this.detections.get(camera)
    return cameraDetections ? Array.from(cameraDetections.values()) : []
  }

  /**
   * Subscribe to journey updates
   */
  subscribeToJourneys(callback: JourneyCallback): () => void {
    this.journeySubscribers.add(callback)

    // Immediately send current state
    callback(new Map(this.journeys))

    // Return unsubscribe function
    return () => {
      this.journeySubscribers.delete(callback)
    }
  }

  /**
   * Get all active journeys
   */
  getJourneys(): Map<string, JourneyUpdate> {
    return new Map(this.journeys)
  }

  /**
   * Get journey for a specific person
   */
  getJourneyForPerson(displayId: string): JourneyUpdate | undefined {
    return this.journeys.get(displayId)
  }

  /**
   * Force reconnection attempt (resets retry count)
   */
  reconnect(): void {
    if (this.client) {
      this.client.end(true)
      this.client = null
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
    this.retryCount = 0
    this.permanentlyFailed = false
    this.connect()
  }
}

// Singleton instance
export const mqttManager = new MqttConnectionManager()

export default mqttManager
