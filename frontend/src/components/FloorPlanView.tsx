/**
 * FloorPlanView - Visual floor plan with live person tracking
 *
 * Shows camera positions and animated journey paths for active persons.
 * Integrates with useJourneys hook for real-time MQTT updates.
 * Supports drag-to-reposition cameras in edit mode.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useJourneys } from '../hooks/useJourneys'
import JourneyPath from './JourneyPath'
import type { JourneyUpdate } from '../services/mqttClient'

// Type for camera position
interface CameraPosition {
  x: number
  y: number
  label: string
}

// Colors for different persons
const PERSON_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // green
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
]

// Default camera adjacency for drawing connection lines (used as fallback)
const DEFAULT_FLOW_CONNECTIONS: [string, string][] = [
  ['entrance', 'bar_lounge'],
  ['entrance', 'hallway'],
  ['bar_lounge', 'cashier'],
  ['bar_lounge', 'seating'],
  ['bar_lounge', 'bar'],
  ['bar', 'food_pickup'],
  ['food_pickup', 'kitchen'],
  ['kitchen', 'back_hallway'],
  ['kitchen', 'storage'],
  ['back_hallway', 'storage'],
  ['back_hallway', 'office'],
  ['back_hallway', 'hallway'],
  ['hallway', 'seating'],
  ['hallway', 'cashier'],
  ['seating', 'cashier'],
  ['seating', 'patio'],
  ['cashier', 'vip_room'],
  ['vip_room', 'karaoke'],
]

// Default positions (fallback if API fails)
const DEFAULT_POSITIONS: Record<string, CameraPosition> = {
  entrance: { x: 10, y: 50, label: 'Entrance' },
  bar_lounge: { x: 25, y: 40, label: 'Bar Lounge' },
  bar: { x: 25, y: 25, label: 'Bar' },
  seating: { x: 50, y: 55, label: 'Seating' },
  cashier: { x: 40, y: 35, label: 'Cashier' },
  food_pickup: { x: 35, y: 15, label: 'Food Pickup' },
  kitchen: { x: 50, y: 10, label: 'Kitchen' },
  hallway: { x: 60, y: 45, label: 'Hallway' },
  back_hallway: { x: 75, y: 25, label: 'Back Hall' },
  vip_room: { x: 70, y: 65, label: 'VIP Room' },
  karaoke: { x: 85, y: 75, label: 'Karaoke' },
  patio: { x: 65, y: 80, label: 'Patio' },
  storage: { x: 85, y: 15, label: 'Storage' },
  office: { x: 90, y: 30, label: 'Office' },
}

interface JourneyDetailPanelProps {
  journey: JourneyUpdate
  color: string
  onClose: () => void
}

function JourneyDetailPanel({ journey, color, onClose }: JourneyDetailPanelProps) {
  const totalDuration = journey.journey.reduce((sum, step) => {
    return sum + (step.dwell_seconds || 0)
  }, 0)

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="absolute right-4 top-4 w-72 bg-gray-800/95 backdrop-blur rounded-lg shadow-xl border border-gray-700 z-10">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h4 className="text-white font-bold">Person {journey.display_id}</h4>
          {journey.is_staff && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-600 rounded text-white">
              Staff
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-3">
        <div className="flex justify-between text-sm mb-3">
          <span className="text-gray-400">Total time:</span>
          <span className="text-white font-medium">
            {Math.floor(totalDuration / 60)}m {totalDuration % 60}s
          </span>
        </div>

        {journey.current_zone && (
          <div className="flex justify-between text-sm mb-3">
            <span className="text-gray-400">Current location:</span>
            <span className="text-green-400 font-medium">{journey.current_zone}</span>
          </div>
        )}

        {/* Journey timeline */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {journey.journey.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1"
                  style={{ backgroundColor: color }}
                />
                {i < journey.journey.length - 1 && (
                  <div className="w-0.5 h-8 bg-gray-600 my-1" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className="text-white text-sm font-medium">{step.zone}</span>
                  {step.dwell_seconds && (
                    <span className="text-gray-500 text-xs">
                      {Math.floor(step.dwell_seconds / 60)}m
                    </span>
                  )}
                </div>
                <span className="text-gray-500 text-xs">
                  {formatTime(step.enter)}
                  {step.exit && ` - ${formatTime(step.exit)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface FloorPlanViewProps {
  className?: string
}

export function FloorPlanView({ className = '' }: FloorPlanViewProps) {
  const { journeys, activeCount, isConnected } = useJourneys({ enabled: true })
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [showConnections, setShowConnections] = useState(true)
  const [showFlowArrows, setShowFlowArrows] = useState(false)
  const [isEditingFlows, setIsEditingFlows] = useState(false)
  const [selectedFlowIndex, setSelectedFlowIndex] = useState<number | null>(null)
  const [newConnectionFrom, setNewConnectionFrom] = useState<string | null>(null)
  const [showHistorical, setShowHistorical] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [cameraPositions, setCameraPositions] = useState<Record<string, CameraPosition>>(DEFAULT_POSITIONS)
  const [flowConnections, setFlowConnections] = useState<[string, string][]>(DEFAULT_FLOW_CONNECTIONS)
  const [draggingCamera, setDraggingCamera] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [hasUnsavedFlowChanges, setHasUnsavedFlowChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Fetch positions and flow connections from backend on mount
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch('/api/analytics/floorplan/positions')
        if (res.ok) {
          const data = await res.json()
          if (data.positions) {
            setCameraPositions(data.positions)
          }
        }
      } catch (err) {
        console.error('Failed to fetch camera positions:', err)
      }
    }

    const fetchFlowConnections = async () => {
      try {
        const res = await fetch('/api/analytics/floorplan/flows')
        if (res.ok) {
          const data = await res.json()
          if (data.connections) {
            setFlowConnections(data.connections)
          }
        }
      } catch (err) {
        console.error('Failed to fetch flow connections:', err)
      }
    }

    fetchPositions()
    fetchFlowConnections()
  }, [])

  // Save positions to backend
  const savePositions = useCallback(async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/analytics/floorplan/positions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: cameraPositions }),
      })
      if (res.ok) {
        setHasUnsavedChanges(false)
      }
    } catch (err) {
      console.error('Failed to save camera positions:', err)
    } finally {
      setIsSaving(false)
    }
  }, [cameraPositions])

  // Reset positions to defaults
  const resetPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/floorplan/positions/reset', {
        method: 'POST',
      })
      if (res.ok) {
        setCameraPositions(DEFAULT_POSITIONS)
        setHasUnsavedChanges(false)
      }
    } catch (err) {
      console.error('Failed to reset camera positions:', err)
    }
  }, [])

  // Save flow connections to backend
  const saveFlowConnections = useCallback(async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/analytics/floorplan/flows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connections: flowConnections }),
      })
      if (res.ok) {
        setHasUnsavedFlowChanges(false)
      }
    } catch (err) {
      console.error('Failed to save flow connections:', err)
    } finally {
      setIsSaving(false)
    }
  }, [flowConnections])

  // Reset flow connections to defaults
  const resetFlowConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/floorplan/flows/reset', {
        method: 'POST',
      })
      if (res.ok) {
        setFlowConnections(DEFAULT_FLOW_CONNECTIONS)
        setHasUnsavedFlowChanges(false)
        setSelectedFlowIndex(null)
      }
    } catch (err) {
      console.error('Failed to reset flow connections:', err)
    }
  }, [])

  // Delete a flow connection
  const deleteFlowConnection = useCallback((index: number) => {
    setFlowConnections(prev => prev.filter((_, i) => i !== index))
    setSelectedFlowIndex(null)
    setHasUnsavedFlowChanges(true)
  }, [])

  // Add a new flow connection
  const addFlowConnection = useCallback((from: string, to: string) => {
    // Check if connection already exists (in either direction)
    const exists = flowConnections.some(
      ([f, t]) => (f === from && t === to) || (f === to && t === from)
    )
    if (!exists && from !== to) {
      setFlowConnections(prev => [...prev, [from, to]])
      setHasUnsavedFlowChanges(true)
    }
    setNewConnectionFrom(null)
  }, [flowConnections])

  // Handle camera click when creating new connection
  const handleCameraClickForConnection = useCallback((cameraId: string) => {
    if (!isEditingFlows) return

    if (newConnectionFrom === null) {
      setNewConnectionFrom(cameraId)
    } else if (newConnectionFrom === cameraId) {
      setNewConnectionFrom(null) // Cancel
    } else {
      addFlowConnection(newConnectionFrom, cameraId)
    }
  }, [isEditingFlows, newConnectionFrom, addFlowConnection])

  // Convert mouse/touch position to SVG coordinates
  const getSvgCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) }
  }, [])

  // Handle mouse/touch move for dragging
  const handleDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingCamera || !isEditMode) return

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const coords = getSvgCoordinates(clientX, clientY)

    if (coords) {
      setCameraPositions(prev => ({
        ...prev,
        [draggingCamera]: {
          ...prev[draggingCamera],
          x: Math.round(coords.x),
          y: Math.round(coords.y),
        },
      }))
      setHasUnsavedChanges(true)
    }
  }, [draggingCamera, isEditMode, getSvgCoordinates])

  // Filter to active journeys (seen in last 5 min)
  const activeJourneys = useMemo(() => {
    return journeys.filter((j) => {
      if (!j.last_seen) return false
      const lastSeen = new Date(j.last_seen)
      return Date.now() - lastSeen.getTime() < 5 * 60 * 1000
    })
  }, [journeys])

  // Get displayed journeys based on filter
  const displayedJourneys = showHistorical ? journeys : activeJourneys

  // Get color for a person
  const getPersonColor = (index: number) => PERSON_COLORS[index % PERSON_COLORS.length]

  // Find selected journey
  const selectedJourney = selectedPersonId
    ? displayedJourneys.find((j) => j.display_id === selectedPersonId)
    : null

  const selectedJourneyIndex = selectedJourney
    ? displayedJourneys.findIndex((j) => j.display_id === selectedPersonId)
    : -1

  return (
    <div className={`floor-plan-container bg-gray-800 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Live Floor View
          <span className="text-gray-400 font-normal text-sm">
            ({activeCount} active)
          </span>
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Mode Toggle */}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
              isEditMode
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </button>

          {/* Save/Reset buttons when in edit mode */}
          {isEditMode && (
            <>
              <button
                onClick={savePositions}
                disabled={!hasUnsavedChanges || isSaving}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  hasUnsavedChanges && !isSaving
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={resetPositions}
                className="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                Reset
              </button>
            </>
          )}

          {/* Connection lines toggle */}
          {!isEditMode && (
            <button
              onClick={() => setShowConnections(!showConnections)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                showConnections
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              Paths
            </button>
          )}

          {/* Flow arrows toggle */}
          {!isEditMode && (
            <button
              onClick={() => {
                setShowFlowArrows(!showFlowArrows)
                if (showFlowArrows) setIsEditingFlows(false)
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                showFlowArrows
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Flow
            </button>
          )}

          {/* Edit Flow Arrows button */}
          {showFlowArrows && !isEditMode && (
            <button
              onClick={() => setIsEditingFlows(!isEditingFlows)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                isEditingFlows
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          )}

          {/* Save/Reset buttons for flow editing */}
          {isEditingFlows && (
            <>
              <button
                onClick={saveFlowConnections}
                disabled={!hasUnsavedFlowChanges || isSaving}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  hasUnsavedFlowChanges && !isSaving
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={resetFlowConnections}
                className="px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                Reset
              </button>
            </>
          )}

          {/* Historical toggle */}
          {!isEditMode && (
            <button
              onClick={() => setShowHistorical(!showHistorical)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                showHistorical
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              History
            </button>
          )}

          {/* Connection status */}
          <span
            className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 ${
              isConnected ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            {isConnected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Edit mode instructions */}
      {isEditMode && (
        <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300 text-sm">
          Drag cameras to reposition them. Click Save when done.
        </div>
      )}

      {/* Flow editing instructions and controls */}
      {isEditingFlows && (
        <div className="mb-3 p-3 bg-indigo-900/30 border border-indigo-700 rounded">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-indigo-300 text-sm">
              {newConnectionFrom ? (
                <span>
                  Creating connection from <strong>{cameraPositions[newConnectionFrom]?.label || newConnectionFrom}</strong> — click another camera or click same to cancel
                </span>
              ) : selectedFlowIndex !== null ? (
                <span>Arrow selected — use buttons to modify</span>
              ) : (
                <span>Click arrow to select, or click camera to start new connection</span>
              )}
            </div>
            {selectedFlowIndex !== null && (
              <div className="flex gap-2">
                <button
                  onClick={() => deleteFlowConnection(selectedFlowIndex)}
                  className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Connection
                </button>
                <button
                  onClick={() => setSelectedFlowIndex(null)}
                  className="px-2 py-1 rounded text-xs font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floor plan SVG */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          className={`w-full h-[500px] md:h-[650px] bg-gray-900 rounded-lg ${isEditMode || isEditingFlows ? 'cursor-crosshair' : ''}`}
          onMouseMove={handleDrag}
          onMouseUp={() => setDraggingCamera(null)}
          onMouseLeave={() => setDraggingCamera(null)}
          onTouchMove={handleDrag}
          onTouchEnd={() => setDraggingCamera(null)}
        >
          {/* Grid pattern and arrow markers */}
          <defs>
            <pattern id="floor-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1F2937" strokeWidth="0.3" />
            </pattern>
            {/* Bidirectional arrow markers - end */}
            <marker
              id="flow-arrow-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366F1" opacity="0.8" />
            </marker>
            {/* Bidirectional arrow markers - start */}
            <marker
              id="flow-arrow-start"
              viewBox="0 0 10 10"
              refX="1"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M 10 0 L 0 5 L 10 10 z" fill="#6366F1" opacity="0.8" />
            </marker>
            {/* Dim arrows for non-primary connections */}
            <marker
              id="flow-arrow-dim-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="3"
              markerHeight="3"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B7280" opacity="0.6" />
            </marker>
            <marker
              id="flow-arrow-dim-start"
              viewBox="0 0 10 10"
              refX="1"
              refY="5"
              markerWidth="3"
              markerHeight="3"
              orient="auto"
            >
              <path d="M 10 0 L 0 5 L 10 10 z" fill="#6B7280" opacity="0.6" />
            </marker>
            {/* Selected arrow markers */}
            <marker
              id="flow-arrow-selected-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#F59E0B" />
            </marker>
            <marker
              id="flow-arrow-selected-start"
              viewBox="0 0 10 10"
              refX="1"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 10 0 L 0 5 L 10 10 z" fill="#F59E0B" />
            </marker>
            {/* Edit mode arrow markers */}
            <marker
              id="flow-arrow-edit-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#A5B4FC" opacity="0.9" />
            </marker>
            <marker
              id="flow-arrow-edit-start"
              viewBox="0 0 10 10"
              refX="1"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto"
            >
              <path d="M 10 0 L 0 5 L 10 10 z" fill="#A5B4FC" opacity="0.9" />
            </marker>
          </defs>
          <rect width="100" height="100" fill="url(#floor-grid)" />

          {/* Camera connection lines */}
          {showConnections && !isEditMode && !showFlowArrows && (
            <g className="camera-connections" opacity={0.3}>
              {flowConnections.map(([from, to], i) => {
                const fromPos = cameraPositions[from]
                const toPos = cameraPositions[to]
                if (!fromPos || !toPos) return null
                return (
                  <line
                    key={i}
                    x1={fromPos.x}
                    y1={fromPos.y}
                    x2={toPos.x}
                    y2={toPos.y}
                    stroke="#4B5563"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                  />
                )
              })}
            </g>
          )}

          {/* Flow direction arrows */}
          {showFlowArrows && !isEditMode && (
            <g className={`flow-arrows ${isEditingFlows ? 'editing' : ''}`}>
              {flowConnections.map(([from, to], i) => {
                const fromPos = cameraPositions[from]
                const toPos = cameraPositions[to]
                if (!fromPos || !toPos) return null

                // Calculate direction and offset arrow to not overlap camera markers
                const dx = toPos.x - fromPos.x
                const dy = toPos.y - fromPos.y
                const len = Math.sqrt(dx * dx + dy * dy)
                if (len === 0) return null

                // Normalize and offset by 5 units from each end
                const offsetStart = 5
                const offsetEnd = 5
                const nx = dx / len
                const ny = dy / len

                const x1 = fromPos.x + nx * offsetStart
                const y1 = fromPos.y + ny * offsetStart
                const x2 = toPos.x - nx * offsetEnd
                const y2 = toPos.y - ny * offsetEnd

                // Highlight connections involving entrance/bar_lounge
                const isPrimaryFlow = from === 'entrance' || to === 'entrance' || from === 'bar_lounge' || to === 'bar_lounge'

                const isSelected = selectedFlowIndex === i

                // Determine marker styles based on state
                const markerStartId = isSelected
                  ? 'url(#flow-arrow-selected-start)'
                  : isEditingFlows
                    ? 'url(#flow-arrow-edit-start)'
                    : isPrimaryFlow
                      ? 'url(#flow-arrow-start)'
                      : 'url(#flow-arrow-dim-start)'

                const markerEndId = isSelected
                  ? 'url(#flow-arrow-selected-end)'
                  : isEditingFlows
                    ? 'url(#flow-arrow-edit-end)'
                    : isPrimaryFlow
                      ? 'url(#flow-arrow-end)'
                      : 'url(#flow-arrow-dim-end)'

                return (
                  <g
                    key={i}
                    className={isEditingFlows ? 'cursor-pointer' : ''}
                    onClick={isEditingFlows ? () => setSelectedFlowIndex(isSelected ? null : i) : undefined}
                  >
                    {/* Invisible wider hitbox for easier clicking */}
                    {isEditingFlows && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="transparent"
                        strokeWidth="12"
                      />
                    )}
                    {/* Bidirectional arrow line */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSelected ? '#F59E0B' : isEditingFlows ? '#A5B4FC' : isPrimaryFlow ? '#6366F1' : '#6B7280'}
                      strokeWidth={isSelected ? 2 : isEditingFlows ? 1.5 : isPrimaryFlow ? 1.2 : 0.8}
                      opacity={isSelected ? 1 : isEditingFlows ? 0.9 : isPrimaryFlow ? 0.8 : 0.6}
                      markerStart={markerStartId}
                      markerEnd={markerEndId}
                      className={`flow-arrow-line ${isEditingFlows ? 'editable' : ''} ${isSelected ? 'selected' : ''}`}
                    />
                    {/* Show connection label when editing */}
                    {isEditingFlows && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 2}
                        fontSize="3.5"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        fill={isSelected ? '#FCD34D' : '#A5B4FC'}
                        textAnchor="middle"
                        className="pointer-events-none"
                      >
                        {from} ↔ {to}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )}

          {/* Camera markers */}
          <g className="camera-markers">
            {Object.entries(cameraPositions).map(([id, pos]) => {
              const isConnectionSource = newConnectionFrom === id
              const isClickableForConnection = isEditingFlows && !isEditMode

              return (
              <g
                key={id}
                className={`camera-marker ${isEditMode ? 'cursor-move' : ''} ${isClickableForConnection ? 'cursor-pointer' : ''}`}
                onMouseDown={(e) => {
                  if (isEditMode) {
                    e.preventDefault()
                    setDraggingCamera(id)
                  }
                }}
                onTouchStart={(e) => {
                  if (isEditMode) {
                    e.preventDefault()
                    setDraggingCamera(id)
                  }
                }}
                onClick={() => {
                  if (isClickableForConnection) {
                    handleCameraClickForConnection(id)
                  }
                }}
              >
                {/* Camera icon background - larger size */}
                <rect
                  x={pos.x - 4}
                  y={pos.y - 4}
                  width={8}
                  height={8}
                  rx={1.5}
                  fill={isConnectionSource ? '#6366F1' : draggingCamera === id ? '#3B82F6' : '#374151'}
                  stroke={isConnectionSource ? '#A5B4FC' : isEditMode ? '#F59E0B' : isEditingFlows ? '#6366F1' : '#6B7280'}
                  strokeWidth={isConnectionSource ? 1.5 : isEditMode || isEditingFlows ? 1 : 0.5}
                />
                {/* Camera icon */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={2}
                  fill={isConnectionSource ? '#FFF' : isEditMode ? '#FCD34D' : isEditingFlows ? '#A5B4FC' : '#9CA3AF'}
                />
                {/* Label */}
                <text
                  x={pos.x}
                  y={pos.y + 11}
                  fontSize="4.5"
                  fill={isConnectionSource ? '#A5B4FC' : isEditMode ? '#FCD34D' : isEditingFlows ? '#818CF8' : '#9CA3AF'}
                  textAnchor="middle"
                  className="pointer-events-none select-none"
                >
                  {pos.label}
                </text>
              </g>
              )
            })}
          </g>

          {/* Journey paths (only when not in edit mode) */}
          {!isEditMode && (
            <g className="journey-paths">
              {displayedJourneys.map((journey, i) => {
                const isActive = activeJourneys.some((j) => j.display_id === journey.display_id)
                // Map journey to use current camera positions
                const mappedJourney = journey.journey.map(step => ({
                  ...step,
                  camera: step.camera,
                }))
                return (
                  <JourneyPath
                    key={journey.display_id}
                    journey={mappedJourney}
                    displayId={journey.display_id}
                    color={getPersonColor(i)}
                    isActive={isActive}
                    isSelected={selectedPersonId === journey.display_id}
                    onSelect={() =>
                      setSelectedPersonId(
                        selectedPersonId === journey.display_id ? null : journey.display_id
                      )
                    }
                    cameraPositions={cameraPositions}
                  />
                )
              })}
            </g>
          )}
        </svg>

        {/* Journey detail panel */}
        {selectedJourney && !isEditMode && (
          <JourneyDetailPanel
            journey={selectedJourney}
            color={getPersonColor(selectedJourneyIndex)}
            onClose={() => setSelectedPersonId(null)}
          />
        )}
      </div>

      {/* Person legend (only when not in edit mode) */}
      {!isEditMode && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {displayedJourneys.length === 0 ? (
              <p className="text-gray-500 text-sm">No active persons detected</p>
            ) : (
              displayedJourneys.map((journey, i) => {
                const isActive = activeJourneys.some((j) => j.display_id === journey.display_id)
                return (
                  <button
                    key={journey.display_id}
                    onClick={() =>
                      setSelectedPersonId(
                        selectedPersonId === journey.display_id ? null : journey.display_id
                      )
                    }
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                      selectedPersonId === journey.display_id
                        ? 'bg-gray-600 ring-2 ring-blue-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } ${!isActive ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`w-3 h-3 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: getPersonColor(i) }}
                    />
                    <span className="text-white text-sm font-medium">
                      {journey.display_id}
                    </span>
                    {journey.is_staff && (
                      <span className="text-xs text-blue-400">(Staff)</span>
                    )}
                    <span className="text-gray-400 text-xs">
                      {journey.current_zone || 'unknown'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-500 text-center mt-3">
        {isEditMode
          ? 'Drag cameras to reposition. Changes are saved to the server.'
          : 'Click on a person to view their journey details'}
      </p>
    </div>
  )
}

export default FloorPlanView
