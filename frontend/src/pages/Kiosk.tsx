import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getOccupancy,
  getAnalyticsSummary,
  getStaff,
  getCameras,
  type OccupancyData,
  type AnalyticsSummary,
  type Staff,
  type Camera
} from '../api/client'

type DisplayMode = 'occupancy' | 'waitTime' | 'staff' | 'cameras'

const ROTATION_INTERVAL = 10000 // 10 seconds between rotations
const CURSOR_HIDE_DELAY = 3000 // 3 seconds of inactivity

interface StatDisplayProps {
  label: string
  value: string | number
  subValue?: string
  color: string
  icon: string
}

function StatDisplay({ label, value, subValue, color, icon }: StatDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className={`text-${color}-400 mb-6`}>
        <svg className="w-24 h-24 md:w-32 md:h-32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
        </svg>
      </div>
      <p className="text-3xl md:text-4xl font-medium text-gray-400 mb-4">{label}</p>
      <p className={`text-8xl md:text-[10rem] lg:text-[14rem] font-bold text-${color}-400 leading-none`}>
        {value}
      </p>
      {subValue && (
        <p className="text-2xl md:text-4xl text-gray-500 mt-6">{subValue}</p>
      )}
    </div>
  )
}

function OccupancyDisplay({ data }: { data: OccupancyData | null }) {
  const total = data?.total_count ?? 0
  const cameraCount = Object.keys(data?.by_camera || {}).length
  const zoneCount = Object.keys(data?.by_zone || {}).length

  return (
    <StatDisplay
      label="Current Occupancy"
      value={total}
      subValue={`${cameraCount} cameras / ${zoneCount} zones`}
      color="blue"
      icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    />
  )
}

function WaitTimeDisplay({ data }: { data: AnalyticsSummary | null }) {
  const waitTime = data?.avg_wait_time ?? 0
  const busiest = data?.busiest_hour ?? '--'

  return (
    <StatDisplay
      label="Average Wait Time"
      value={`${waitTime}`}
      subValue={`minutes / Peak: ${busiest}`}
      color="yellow"
      icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  )
}

function StaffDisplay({ staff }: { staff: Staff[] }) {
  const activeStaff = staff.filter(s => s.is_active).length
  const total = staff.length

  return (
    <StatDisplay
      label="Staff On Floor"
      value={activeStaff}
      subValue={`of ${total} total staff`}
      color="green"
      icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  )
}

function CameraDisplay({ cameras }: { cameras: Camera[] }) {
  const online = cameras.filter(c => c.fps > 0).length
  const total = cameras.length
  const avgFps = cameras.length > 0
    ? (cameras.reduce((sum, c) => sum + c.fps, 0) / cameras.length).toFixed(1)
    : '0'

  return (
    <StatDisplay
      label="Cameras Online"
      value={`${online}/${total}`}
      subValue={`Avg FPS: ${avgFps}`}
      color="purple"
      icon="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  )
}

export default function Kiosk() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<DisplayMode>('occupancy')
  const [autoRotate, setAutoRotate] = useState(true)
  const [cursorHidden, setCursorHidden] = useState(false)
  const [showControls, setShowControls] = useState(true)

  // Data states
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const modes: DisplayMode[] = ['occupancy', 'waitTime', 'staff', 'cameras']

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [occRes, sumRes, staffRes, camRes] = await Promise.all([
        getOccupancy(),
        getAnalyticsSummary(),
        getStaff(),
        getCameras()
      ])
      setOccupancy(occRes.data)
      setSummary(sumRes.data)
      setStaff(staffRes.data?.staff || [])
      setCameras(camRes.data || [])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Failed to fetch kiosk data:', err)
    }
  }, [])

  // Initial data fetch and polling
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [fetchData])

  // Auto rotation
  useEffect(() => {
    if (!autoRotate) return

    const interval = setInterval(() => {
      setMode(current => {
        const currentIndex = modes.indexOf(current)
        return modes[(currentIndex + 1) % modes.length]
      })
    }, ROTATION_INTERVAL)

    return () => clearInterval(interval)
  }, [autoRotate])

  // Cursor hide on inactivity
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>

    const handleActivity = () => {
      setCursorHidden(false)
      setShowControls(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        setCursorHidden(true)
        setShowControls(false)
      }, CURSOR_HIDE_DELAY)
    }

    handleActivity() // Initialize
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('touchstart', handleActivity)
    window.addEventListener('keydown', handleActivity)

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          navigate('/')
          break
        case 'ArrowLeft':
          setMode(current => {
            const currentIndex = modes.indexOf(current)
            return modes[(currentIndex - 1 + modes.length) % modes.length]
          })
          break
        case 'ArrowRight':
          setMode(current => {
            const currentIndex = modes.indexOf(current)
            return modes[(currentIndex + 1) % modes.length]
          })
          break
        case ' ':
          e.preventDefault()
          setAutoRotate(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  const exitKiosk = () => {
    navigate('/')
  }

  return (
    <div
      className={`fixed inset-0 bg-gray-900 flex flex-col ${cursorHidden ? 'cursor-none' : ''}`}
      style={{ zIndex: 9999 }}
    >
      {/* Top bar with time and controls */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 flex justify-between items-center transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="text-gray-400 text-lg">
          {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setAutoRotate(prev => !prev)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoRotate
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            {autoRotate ? 'Auto-Rotate: ON' : 'Auto-Rotate: OFF'}
          </button>
          <button
            onClick={exitKiosk}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium transition-colors"
          >
            Exit Kiosk
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-8">
        {mode === 'occupancy' && <OccupancyDisplay data={occupancy} />}
        {mode === 'waitTime' && <WaitTimeDisplay data={summary} />}
        {mode === 'staff' && <StaffDisplay staff={staff} />}
        {mode === 'cameras' && <CameraDisplay cameras={cameras} />}
      </main>

      {/* Bottom navigation dots */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-6 flex justify-center items-center gap-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setAutoRotate(false)
            }}
            className={`w-4 h-4 rounded-full transition-all ${
              mode === m
                ? 'bg-blue-500 scale-125'
                : 'bg-gray-600 hover:bg-gray-500'
            }`}
            title={m.charAt(0).toUpperCase() + m.slice(1)}
          />
        ))}
      </div>

      {/* Mode labels */}
      <div
        className={`absolute bottom-16 left-0 right-0 flex justify-center gap-8 text-sm text-gray-500 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {modes.map((m) => (
          <span
            key={m}
            className={`capitalize ${mode === m ? 'text-gray-300 font-medium' : ''}`}
          >
            {m === 'waitTime' ? 'Wait Time' : m}
          </span>
        ))}
      </div>

      {/* Instructions overlay (shown briefly on first load) */}
      <div
        className={`absolute bottom-4 right-4 text-xs text-gray-600 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span>ESC to exit</span>
        <span className="mx-2">|</span>
        <span>Arrows to navigate</span>
        <span className="mx-2">|</span>
        <span>Space to toggle rotation</span>
      </div>
    </div>
  )
}
