/**
 * JourneyPath - Draws animated SVG path for a person's journey across cameras
 */

import { useMemo } from 'react'

// Type for camera position
interface CameraPosition {
  x: number
  y: number
  label: string
}

interface JourneyStep {
  camera: string
  zone: string
  enter: string
  exit: string | null
  dwell_seconds?: number | null
}

interface JourneyPathProps {
  journey: JourneyStep[]
  displayId: string
  color: string
  isActive: boolean
  isSelected?: boolean
  onSelect?: () => void
  cameraPositions: Record<string, CameraPosition>
}

export function JourneyPath({
  journey,
  displayId,
  color,
  isActive,
  isSelected = false,
  onSelect,
  cameraPositions,
}: JourneyPathProps) {
  // Build path points from journey cameras
  const points = useMemo(() => {
    return journey
      .map((step) => cameraPositions[step.camera])
      .filter(Boolean)
  }, [journey, cameraPositions])

  // Create SVG path string
  const pathD = useMemo(() => {
    if (points.length === 0) return ''
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ')
  }, [points])

  if (points.length === 0) return null

  const lastPoint = points[points.length - 1]
  const strokeWidth = isSelected ? 4 : isActive ? 3 : 1.5
  const opacity = isSelected ? 1 : isActive ? 0.9 : 0.4

  return (
    <g
      className={`journey-path ${isActive ? 'active' : 'historical'} ${isSelected ? 'selected' : ''}`}
      style={{ cursor: onSelect ? 'pointer' : 'default' }}
      onClick={onSelect}
    >
      {/* Path line */}
      <path
        d={pathD}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={isActive ? 'none' : '5,5'}
        opacity={opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isActive && isSelected ? 'animated-path' : ''}
      />

      {/* Journey waypoints */}
      {points.slice(0, -1).map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={isSelected ? 4 : 2.5}
          fill={color}
          opacity={opacity * 0.7}
        />
      ))}

      {/* Current position indicator (last point) */}
      {isActive && (
        <>
          {/* Pulse ring */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={isSelected ? 10 : 8}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.5}
            className="pulse-ring"
          />
          {/* Solid center */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={isSelected ? 6 : 5}
            fill={color}
            className="pulse-dot"
          />
        </>
      )}

      {/* Person label */}
      {(isActive || isSelected) && (
        <g>
          {/* Label background */}
          <rect
            x={lastPoint.x + 8}
            y={lastPoint.y - 6}
            width={displayId.length * 5 + 8}
            height={12}
            rx={3}
            fill="rgba(0,0,0,0.7)"
          />
          {/* Label text */}
          <text
            x={lastPoint.x + 12}
            y={lastPoint.y + 3}
            fontSize="8"
            fontWeight="bold"
            fill={color}
          >
            {displayId}
          </text>
        </g>
      )}
    </g>
  )
}

export default JourneyPath
