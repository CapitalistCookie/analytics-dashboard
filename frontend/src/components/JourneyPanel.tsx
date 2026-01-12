/**
 * JourneyPanel - Shows real-time person journeys across cameras
 *
 * Displays:
 * - Currently tracked persons
 * - Current location (camera/zone)
 * - Time in venue
 * - Expandable journey path
 */

import { useState, useEffect } from 'react'
import { useJourneys } from '../hooks/useJourneys'
import { getTrackedPersons, getPersonJourney, TrackedPerson, PersonJourney } from '../api/client'

// Zone color mapping
const ZONE_COLORS: Record<string, string> = {
  entrance: '#22c55e',      // green
  hallway: '#6b7280',       // gray
  seating_main: '#3b82f6',  // blue
  seating_service: '#8b5cf6', // purple
  service_area: '#f59e0b',  // amber
  cashier: '#ef4444',       // red
  kitchen: '#f97316',       // orange
  kitchen_prep: '#fb923c',  // light orange
  unknown: '#9ca3af',       // gray
}

// Color palette for differentiating tracked persons by displayId
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

// Get color for a tracked person based on their displayId
const getPersonIdColor = (displayId: string): string => {
  if (!displayId || displayId.length === 0) return '#8b5cf6'
  const letter = displayId.charAt(0).toUpperCase()
  const letterIndex = letter.charCodeAt(0) - 65 // A=0, B=1, etc.
  if (letterIndex >= 0 && letterIndex < PERSON_ID_COLORS.length) {
    return PERSON_ID_COLORS[letterIndex]
  }
  return '#8b5cf6'
}

interface JourneyPanelProps {
  collapsed?: boolean
  onToggle?: () => void
  className?: string
}

export function JourneyPanel({ collapsed = false, onToggle, className = '' }: JourneyPanelProps) {
  const { journeys, activeCount, isConnected } = useJourneys({ enabled: true })
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [detailedJourney, setDetailedJourney] = useState<PersonJourney | null>(null)
  const [loadingJourney, setLoadingJourney] = useState(false)
  const [apiPersons, setApiPersons] = useState<TrackedPerson[]>([])

  // Fetch tracked persons from API as backup
  useEffect(() => {
    const fetchPersons = async () => {
      try {
        const response = await getTrackedPersons(true, 20)
        setApiPersons(response.data.persons)
      } catch (error) {
        console.error('Failed to fetch tracked persons:', error)
      }
    }

    fetchPersons()
    const interval = setInterval(fetchPersons, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  // Load detailed journey when person is expanded
  const handleExpandPerson = async (displayId: string, personId: number) => {
    if (expandedPerson === displayId) {
      setExpandedPerson(null)
      setDetailedJourney(null)
      return
    }

    setExpandedPerson(displayId)
    setLoadingJourney(true)

    try {
      const response = await getPersonJourney(personId)
      setDetailedJourney(response.data)
    } catch (error) {
      console.error('Failed to fetch journey:', error)
    } finally {
      setLoadingJourney(false)
    }
  }

  // Merge MQTT journeys with API persons
  const displayedPersons = journeys.length > 0
    ? journeys.map(j => ({
        ...j,
        name: apiPersons.find(p => p.id === j.person_id)?.name || null,
        is_regular: apiPersons.find(p => p.id === j.person_id)?.is_regular || false,
        person_type: apiPersons.find(p => p.id === j.person_id)?.person_type || 'visitor',
        staff_name: apiPersons.find(p => p.id === j.person_id)?.staff_name || null,
      }))
    : apiPersons.map(p => ({
        person_id: p.id,
        display_id: p.display_id,
        name: p.name,
        is_regular: p.is_regular,
        person_type: p.person_type || 'visitor',
        staff_name: p.staff_name,
        current_camera: p.last_camera_id,
        current_zone: null,
        is_staff: p.is_staff,
        journey: [],
        total_duration: '',
        first_seen: p.first_seen,
        last_seen: p.last_seen,
        timestamp: new Date().toISOString(),
      }))

  const formatDuration = (duration: string | null) => {
    if (!duration) return '--'
    return duration
  }

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--'
    // Ensure UTC interpretation by appending 'Z' if missing (backend stores UTC)
    const utcString = isoString.endsWith('Z') ? isoString : isoString + 'Z'
    const date = new Date(utcString)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const getZoneColor = (zone: string | null) => {
    return zone ? ZONE_COLORS[zone] || ZONE_COLORS.unknown : ZONE_COLORS.unknown
  }

  const isActive = (lastSeen: string | null) => {
    if (!lastSeen) return false
    // Ensure UTC interpretation by appending 'Z' if missing
    const utcString = lastSeen.endsWith('Z') ? lastSeen : lastSeen + 'Z'
    const ageMs = Date.now() - new Date(utcString).getTime()
    return ageMs < 5 * 60 * 1000 // Active within 5 minutes
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className={`bg-gray-800 border border-gray-700 rounded-lg p-2 hover:bg-gray-700 transition-colors ${className}`}
        title="Show Journey Panel"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">{activeCount}</span>
        </div>
      </button>
    )
  }

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-200">Active Visitors</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full">
            {activeCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* MQTT Status Indicator */}
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
          {onToggle && (
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              title="Collapse Panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Person List */}
      <div className="max-h-96 overflow-y-auto">
        {displayedPersons.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">No active visitors</p>
          </div>
        ) : (
          displayedPersons.map((person) => (
            <div key={person.display_id} className="border-b border-gray-700/50 last:border-b-0">
              {/* Person Summary Row */}
              <button
                onClick={() => handleExpandPerson(person.display_id, person.person_id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50 transition-colors text-left"
              >
                {/* Avatar/ID Badge - color based on type */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{
                    backgroundColor: person.is_staff
                      ? 'rgba(59, 130, 246, 0.2)'  // Blue for staff
                      : person.is_regular
                        ? 'rgba(245, 158, 11, 0.2)'  // Gold/amber for regulars
                        : `${getPersonIdColor(person.display_id)}20`,
                    color: person.is_staff
                      ? 'rgb(147, 197, 253)'  // Blue
                      : person.is_regular
                        ? 'rgb(251, 191, 36)'  // Gold
                        : getPersonIdColor(person.display_id),
                  }}
                >
                  {person.name ? person.name.charAt(0).toUpperCase() : person.display_id}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isActive(person.last_seen) ? 'text-gray-200' : 'text-gray-500'}`}>
                      {person.name || (person.staff_name ? person.staff_name : `Person ${person.display_id}`)}
                    </span>
                    {/* Type Badge */}
                    {person.is_staff && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">Staff</span>
                    )}
                    {person.is_regular && !person.is_staff && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">Regular</span>
                    )}
                    {isActive(person.last_seen) && (
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span
                      className="px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: getZoneColor(person.current_zone) }}
                    >
                      {person.current_zone || person.current_camera || 'Unknown'}
                    </span>
                    <span>{formatDuration(person.total_duration)}</span>
                  </div>
                </div>

                {/* Expand Arrow */}
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${expandedPerson === person.display_id ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded Journey View */}
              {expandedPerson === person.display_id && (
                <div className="px-4 pb-4 bg-gray-900/50">
                  {loadingJourney ? (
                    <div className="py-4 text-center text-gray-500">
                      <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full mx-auto" />
                    </div>
                  ) : (
                    <>
                      {/* Journey Timeline */}
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-gray-500 mb-2">Journey Path</div>
                        <div className="relative pl-4 border-l-2 border-gray-700 space-y-3">
                          {(detailedJourney?.journey || person.journey).map((stop, idx, arr) => (
                            <div key={idx} className="relative">
                              {/* Timeline Dot */}
                              <div
                                className="absolute -left-[21px] w-3 h-3 rounded-full border-2 border-gray-800"
                                style={{ backgroundColor: getZoneColor(stop.zone) }}
                              />
                              {/* Stop Info */}
                              <div className="text-xs">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="px-1.5 py-0.5 rounded text-white"
                                    style={{ backgroundColor: getZoneColor(stop.zone) }}
                                  >
                                    {stop.zone}
                                  </span>
                                  <span className="text-gray-500">{stop.camera}</span>
                                </div>
                                <div className="text-gray-500 mt-0.5">
                                  {formatTime(stop.enter)}
                                  {stop.exit && ` - ${formatTime(stop.exit)}`}
                                  {stop.dwell_seconds != null && (
                                    <span className="ml-2 text-gray-600">
                                      ({Math.floor(stop.dwell_seconds / 60)}m {stop.dwell_seconds % 60}s)
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Current Location Indicator */}
                              {idx === arr.length - 1 && !stop.exit && (
                                <span className="ml-2 text-xs text-green-500">(current)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Zone Summary */}
                      {detailedJourney?.zone_summary && Object.keys(detailedJourney.zone_summary).length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs text-gray-500 mb-2">Time by Zone</div>
                          <div className="space-y-1">
                            {Object.entries(detailedJourney.zone_summary).map(([zone, seconds]) => (
                              <div key={zone} className="flex items-center gap-2 text-xs">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: getZoneColor(zone) }}
                                />
                                <span className="text-gray-400 flex-1">{zone}</span>
                                <span className="text-gray-500">
                                  {Math.floor(seconds / 60)}m {seconds % 60}s
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* First/Last Seen */}
                      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                        <div>
                          <span className="text-gray-600">Arrived:</span>{' '}
                          {formatTime(detailedJourney?.journey[0]?.enter || person.first_seen)}
                        </div>
                        <div>
                          <span className="text-gray-600">Total:</span>{' '}
                          {detailedJourney?.total_duration || formatDuration(person.total_duration)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default JourneyPanel
