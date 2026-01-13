import { useState, useEffect } from 'react'
import { getZoneTraffic, type ZoneTraffic } from '../api/client'

interface ZoneHeatMapProps {
  refreshInterval?: number
  showLabels?: boolean
}

// Zone positions based on floor plan layout
// Positions are percentages of the container
const ZONE_POSITIONS: Record<string, { x: number; y: number; width: number; height: number }> = {
  entrance: { x: 5, y: 40, width: 15, height: 20 },
  bar_lounge: { x: 22, y: 30, width: 20, height: 30 },
  cashier: { x: 44, y: 35, width: 12, height: 15 },
  seating: { x: 22, y: 65, width: 35, height: 30 },
  bar: { x: 44, y: 10, width: 15, height: 20 },
  vip_room: { x: 58, y: 35, width: 18, height: 25 },
  karaoke: { x: 78, y: 35, width: 18, height: 25 },
  food_pickup: { x: 60, y: 10, width: 15, height: 20 },
  kitchen: { x: 78, y: 10, width: 18, height: 20 },
  patio: { x: 60, y: 70, width: 35, height: 25 },
}

// Color scale from cool (low activity) to hot (high activity)
function getHeatColor(activity: number): string {
  // activity is 0-100
  if (activity <= 10) return 'rgba(59, 130, 246, 0.3)' // blue - very low
  if (activity <= 25) return 'rgba(34, 197, 94, 0.4)' // green - low
  if (activity <= 50) return 'rgba(234, 179, 8, 0.5)' // yellow - medium
  if (activity <= 75) return 'rgba(249, 115, 22, 0.6)' // orange - high
  return 'rgba(239, 68, 68, 0.7)' // red - very high
}

function getTextColor(activity: number): string {
  if (activity <= 25) return 'text-gray-200'
  return 'text-white'
}

export default function ZoneHeatMap({ refreshInterval = 10000, showLabels = true }: ZoneHeatMapProps) {
  const [zones, setZones] = useState<ZoneTraffic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getZoneTraffic(undefined, 1)
        setZones(res.data || [])
        setError(null)
      } catch (err) {
        console.error('Failed to fetch zone traffic:', err)
        setError('Unable to load zone data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  // Create a map of zone name to activity
  const zoneActivityMap = new Map<string, ZoneTraffic>()
  zones.forEach(z => zoneActivityMap.set(z.zone, z))

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 md:p-6 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="aspect-video bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3">Zone Heat Map</h3>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-300">Zone Heat Map</h3>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.5)' }}></span>
            Low
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(234, 179, 8, 0.6)' }}></span>
            Med
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.7)' }}></span>
            High
          </span>
        </div>
      </div>

      {/* Heat map visualization */}
      <div className="relative aspect-[16/9] bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Zone rectangles */}
        {Object.entries(ZONE_POSITIONS).map(([zoneName, pos]) => {
          const zoneData = zoneActivityMap.get(zoneName)
          const activity = zoneData?.activity ?? 0
          const count = zoneData?.count ?? 0
          const heatColor = getHeatColor(activity)
          const textColor = getTextColor(activity)

          return (
            <div
              key={zoneName}
              className="absolute rounded-md border border-white/20 transition-all duration-500 hover:scale-105 hover:z-10 cursor-pointer"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${pos.width}%`,
                height: `${pos.height}%`,
                backgroundColor: heatColor,
              }}
              title={`${zoneName}: ${count} detections (${activity}% activity)`}
            >
              {showLabels && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center ${textColor}`}>
                  <span className="text-xs font-medium capitalize truncate px-1">
                    {zoneName.replace('_', ' ')}
                  </span>
                  <span className="text-lg font-bold">{count}</span>
                  <span className="text-xs opacity-75">{activity}%</span>
                </div>
              )}
            </div>
          )
        })}

        {/* Connection lines showing flow */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {/* entrance -> bar_lounge */}
          <line x1="20%" y1="50%" x2="22%" y2="45%" stroke="white" strokeWidth="1" opacity="0.2" strokeDasharray="4"/>
          {/* bar_lounge -> seating */}
          <line x1="32%" y1="60%" x2="32%" y2="65%" stroke="white" strokeWidth="1" opacity="0.2" strokeDasharray="4"/>
          {/* bar_lounge -> cashier */}
          <line x1="42%" y1="45%" x2="44%" y2="42%" stroke="white" strokeWidth="1" opacity="0.2" strokeDasharray="4"/>
          {/* cashier -> vip_room */}
          <line x1="56%" y1="42%" x2="58%" y2="45%" stroke="white" strokeWidth="1" opacity="0.2" strokeDasharray="4"/>
          {/* vip_room -> karaoke */}
          <line x1="76%" y1="47%" x2="78%" y2="47%" stroke="white" strokeWidth="1" opacity="0.2" strokeDasharray="4"/>
        </svg>
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-700/50 rounded p-2">
          <p className="text-xs text-gray-400">Total Activity</p>
          <p className="text-lg font-bold text-white">
            {zones.reduce((sum, z) => sum + z.count, 0)}
          </p>
        </div>
        <div className="bg-gray-700/50 rounded p-2">
          <p className="text-xs text-gray-400">Busiest Zone</p>
          <p className="text-lg font-bold text-orange-400 capitalize truncate">
            {zones.length > 0
              ? zones.reduce((max, z) => z.activity > max.activity ? z : max, zones[0]).zone.replace('_', ' ')
              : '-'
            }
          </p>
        </div>
        <div className="bg-gray-700/50 rounded p-2">
          <p className="text-xs text-gray-400">Active Zones</p>
          <p className="text-lg font-bold text-blue-400">
            {zones.filter(z => z.count > 0).length}/{Object.keys(ZONE_POSITIONS).length}
          </p>
        </div>
      </div>
    </div>
  )
}
