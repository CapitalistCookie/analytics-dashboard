/**
 * Hook for subscribing to real-time journey updates via MQTT
 */

import { useState, useEffect, useCallback } from 'react'
import mqttManager, { JourneyUpdate } from '../services/mqttClient'

interface UseJourneysOptions {
  enabled?: boolean
}

interface UseJourneysResult {
  journeys: JourneyUpdate[]
  activeCount: number
  getJourneyForPerson: (displayId: string) => JourneyUpdate | undefined
  isConnected: boolean
}

export function useJourneys(options: UseJourneysOptions = {}): UseJourneysResult {
  const { enabled = true } = options
  const [journeys, setJourneys] = useState<JourneyUpdate[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setJourneys([])
      return
    }

    // Subscribe to journey updates
    const unsubscribeJourneys = mqttManager.subscribeToJourneys((journeyMap) => {
      const journeyArray = Array.from(journeyMap.values())
      // Sort by last_seen descending (most recent first)
      journeyArray.sort((a, b) => {
        if (!a.last_seen) return 1
        if (!b.last_seen) return -1
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
      })
      setJourneys(journeyArray)
    })

    // Subscribe to connection status
    const unsubscribeStatus = mqttManager.subscribeToStatus((connected) => {
      setIsConnected(connected)
    })

    return () => {
      unsubscribeJourneys()
      unsubscribeStatus()
    }
  }, [enabled])

  const getJourneyForPerson = useCallback((displayId: string) => {
    return mqttManager.getJourneyForPerson(displayId)
  }, [])

  const activeCount = journeys.filter((j) => {
    if (!j.last_seen) return false
    const lastSeen = new Date(j.last_seen)
    const now = new Date()
    const ageMs = now.getTime() - lastSeen.getTime()
    return ageMs < 5 * 60 * 1000 // Active within 5 minutes
  }).length

  return {
    journeys,
    activeCount,
    getJourneyForPerson,
    isConnected,
  }
}

export default useJourneys
