import { useState, useEffect, useRef, TouchEvent } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getOccupancy, getOccupancyHistory, getCameras, getEvents, type OccupancyData, type Camera, type Event } from '../api/client'
import CameraCard from '../components/CameraCard'
import CameraFeedModal from '../components/CameraFeedModal'
import WebRTCGridCard from '../components/WebRTCGridCard'
import JourneyPanel from '../components/JourneyPanel'
import FloorPlanView from '../components/FloorPlanView'
import QueueStatusWidget from '../components/QueueStatusWidget'
import { useStreamQuality, QUALITY_CONFIGS, type StreamQuality } from '../context/StreamQualityContext'
import { useCamera } from '../context/CameraContext'
import { useWebRTCConnectionManager } from '../context/WebRTCConnectionManager'
import { useDashboardWebSocket } from '../hooks/useDashboardWebSocket'

// WebSocket occupancy data type
interface WsOccupancyData {
  total: number
  by_camera: Record<string, number>
  by_zone: Record<string, number>
  timestamp: string
}

interface OccupancyCardProps {
  wsOccupancy?: WsOccupancyData | null
  isWsConnected?: boolean
  needsPolling?: boolean
}

function OccupancyCard({ wsOccupancy, isWsConnected = false, needsPolling = true }: OccupancyCardProps) {
  const [polledOccupancy, setPolledOccupancy] = useState<OccupancyData | null>(null)
  const [loading, setLoading] = useState(true)

  // Only poll if WebSocket is not connected
  useEffect(() => {
    if (!needsPolling) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      try {
        const res = await getOccupancy()
        setPolledOccupancy(res.data)
      } catch (err) {
        console.error('Failed to fetch occupancy:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [needsPolling])

  // Use WebSocket data if available, otherwise use polled data
  const totalCount = wsOccupancy?.total ?? polledOccupancy?.total_count ?? 0
  const byCamera = wsOccupancy?.by_camera ?? polledOccupancy?.by_camera ?? {}
  const byZone = wsOccupancy?.by_zone ?? polledOccupancy?.by_zone ?? {}

  if (loading && !wsOccupancy) return <div className="bg-gray-800 rounded-lg p-4 md:p-6 animate-pulse h-32 md:h-40"></div>

  const cameraCount = Object.keys(byCamera).length
  const zoneCount = Object.keys(byZone).length

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-300">Current Occupancy</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isWsConnected
              ? 'bg-green-900/50 text-green-400'
              : 'bg-yellow-900/50 text-yellow-400'
          }`}
          title={isWsConnected ? 'Real-time WebSocket updates' : 'Polling every 5 seconds'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isWsConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
          {isWsConnected ? 'Live' : 'Polling'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="text-center">
          <p className="text-2xl md:text-4xl font-bold text-white">{totalCount}</p>
          <p className="text-xs md:text-sm text-gray-400">Total People</p>
        </div>
        <div className="text-center">
          <p className="text-2xl md:text-4xl font-bold text-blue-400">{cameraCount}</p>
          <p className="text-xs md:text-sm text-gray-400">Active Cameras</p>
        </div>
        <div className="text-center">
          <p className="text-2xl md:text-4xl font-bold text-green-400">{zoneCount}</p>
          <p className="text-xs md:text-sm text-gray-400">Active Zones</p>
        </div>
      </div>
    </div>
  )
}

function OccupancyChart() {
  const [history, setHistory] = useState<Array<{timestamp: string, count?: number, total_count?: number}>>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getOccupancyHistory(24)
        // API can return {history: [...]} or [...] directly
        const data = res.data?.history || (Array.isArray(res.data) ? res.data : [])
        setHistory(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Failed to fetch history:', err)
      }
    }
    fetchData()
  }, [])

  const chartData = history.map((d) => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    total: d.total_count ?? d.count ?? 0,
  }))

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3 md:mb-4">Occupancy Trend (24h)</h3>
      <div className="h-48 md:h-64">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={10} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke="#9CA3AF" fontSize={10} tick={{ fontSize: 10 }} width={30} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#9CA3AF' }}
              />
              <Line type="monotone" dataKey="total" stroke="#60A5FA" strokeWidth={2} dot={false} name="People" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No historical data available
          </div>
        )}
      </div>
    </div>
  )
}

// Refresh options - default to 10s for better performance
const REFRESH_OPTIONS = [
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },  // Default - good balance
  { label: '30s', value: 30000 },
  { label: 'Off', value: null },
]

// Live grid polling interval - 500ms (2fps) is smoother than 250ms and half the load
const LIVE_GRID_POLL_INTERVAL = 500

function CameraGrid() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)
  const [refreshInterval, setRefreshInterval] = useState<number | null>(() => {
    const saved = localStorage.getItem('dashboardCameraRefresh')
    return saved ? JSON.parse(saved) : 10000  // Default to 10s for better performance
  })
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null)
  const [isLiveGrid, setIsLiveGrid] = useState(() => {
    const saved = localStorage.getItem('dashboardLiveGrid')
    return saved === 'true'
  })
  const [showDetections, setShowDetections] = useState(() => {
    const saved = localStorage.getItem('dashboardShowDetections')
    return saved === 'true'
  })
  const [liveGridKey, setLiveGridKey] = useState(Date.now())
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const { quality, setQuality, config, getSnapshotUrl, getLiveUrl } = useStreamQuality()
  const { getDisplayName } = useCamera()
  const { activeConnections, maxConnections } = useWebRTCConnectionManager()

  // Determine live mode type
  const isWebRTCLiveGrid = isLiveGrid && config.liveMode === 'webrtc'
  const isMJPEGLiveGrid = isLiveGrid && config.liveMode === 'mjpeg'

  // Cameras per page on mobile
  const camerasPerPageMobile = 2

  // Save refresh interval preference
  useEffect(() => {
    localStorage.setItem('dashboardCameraRefresh', JSON.stringify(refreshInterval))
  }, [refreshInterval])

  // Save live grid preference
  useEffect(() => {
    localStorage.setItem('dashboardLiveGrid', String(isLiveGrid))
  }, [isLiveGrid])

  // Save show detections preference
  useEffect(() => {
    localStorage.setItem('dashboardShowDetections', String(showDetections))
  }, [showDetections])

  // Live grid polling for WebRTC fallback cameras
  // WebRTCGridCard uses this key when it doesn't get a WebRTC slot
  // Using 500ms (2fps) for smooth but efficient polling
  useEffect(() => {
    // Only poll if in live grid mode with WebRTC (for fallback cameras)
    // MJPEG mode uses actual MJPEG streams, no polling needed
    if (!isLiveGrid || isMJPEGLiveGrid || selectedCamera) return

    const interval = setInterval(() => {
      setLiveGridKey(Date.now())
    }, LIVE_GRID_POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [isLiveGrid, isMJPEGLiveGrid, selectedCamera])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getCameras()
        setCameras(res.data || [])
      } catch (err) {
        console.error('Failed to fetch cameras:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh is handled by CameraCard component via refreshInterval prop
  // The refreshInterval state is just for UI selection and localStorage persistence

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const swipeThreshold = 50
    const diff = touchStartX.current - touchEndX.current

    if (Math.abs(diff) > swipeThreshold) {
      const totalPagesMobile = Math.ceil(cameras.length / camerasPerPageMobile)
      if (diff > 0 && currentPage < totalPagesMobile - 1) {
        // Swipe left - next page
        setCurrentPage(prev => prev + 1)
      } else if (diff < 0 && currentPage > 0) {
        // Swipe right - prev page
        setCurrentPage(prev => prev - 1)
      }
    }
  }

  if (loading) return <div className="bg-gray-800 rounded-lg p-4 md:p-6 animate-pulse h-48 md:h-64"></div>

  // Mobile: paginated view, Desktop: grid view
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const totalPagesMobile = Math.ceil(cameras.length / camerasPerPageMobile)
  const paginatedCameras = isMobile
    ? cameras.slice(currentPage * camerasPerPageMobile, (currentPage + 1) * camerasPerPageMobile)
    : cameras

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 md:mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-300">Camera Grid ({cameras.length} cameras)</h3>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle - Primary control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">View:</span>
            <div className="flex bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setIsLiveGrid(false)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  !isLiveGrid ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Snapshots
              </button>
              <button
                onClick={() => setIsLiveGrid(true)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isLiveGrid ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {isLiveGrid && <span className="animate-pulse w-2 h-2 rounded-full bg-white"></span>}
                Live
                {isLiveGrid && isWebRTCLiveGrid && (
                  <span className="text-xs opacity-75">({activeConnections}/{maxConnections})</span>
                )}
              </button>
            </div>
          </div>

          {/* Quality selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">Quality:</span>
            <div className="flex bg-gray-700 rounded-lg p-0.5">
              {(['low', 'medium', 'high'] as StreamQuality[]).map(q => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    quality === q
                      ? q === 'high' ? 'bg-green-600 text-white' : q === 'medium' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title={QUALITY_CONFIGS[q].description}
                >
                  {QUALITY_CONFIGS[q].label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500 hidden sm:inline">{config.resolution}</span>
          </div>

          {/* Detection toggle - visible in Live mode */}
          {isLiveGrid && (
            <button
              onClick={() => setShowDetections(!showDetections)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showDetections
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
              title={showDetections ? 'Hide detection boxes' : 'Show detection boxes'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              <span className="hidden sm:inline">{showDetections ? 'Boxes ON' : 'Boxes'}</span>
            </button>
          )}

          {/* Refresh rate selector (only when in snapshots mode) */}
          {!isLiveGrid && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Refresh:</span>
              <div className="flex bg-gray-700 rounded-lg p-0.5">
                {REFRESH_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => setRefreshInterval(opt.value)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      refreshInterval === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mobile pagination indicator */}
          <div className="flex items-center gap-2 md:hidden">
            {totalPagesMobile > 1 && (
              <>
                <span className="text-xs text-gray-500">{currentPage + 1}/{totalPagesMobile}</span>
                <div className="flex gap-1">
                  {Array.from({ length: totalPagesMobile }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === currentPage ? 'bg-blue-500' : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Swipeable container for mobile */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="touch-pan-y"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {paginatedCameras.map((cam, index) => (
            isLiveGrid ? (
              isWebRTCLiveGrid ? (
                // WebRTC Live mode (Medium/High quality) - uses connection manager
                <WebRTCGridCard
                  key={cam.camera_id}
                  cameraId={cam.camera_id}
                  fps={cam.fps}
                  status={cam.fps > 0 ? 'online' : 'offline'}
                  visibilityIndex={currentPage * camerasPerPageMobile + index}
                  showDetections={showDetections}
                />
              ) : isMJPEGLiveGrid ? (
                // True MJPEG for Low quality
                <div
                  key={cam.camera_id}
                  className="relative bg-gray-700 rounded-lg overflow-hidden aspect-video cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  onDoubleClick={() => setSelectedCamera(cam)}
                >
                  <img
                    src={getLiveUrl(cam.camera_id, true)}
                    alt={cam.camera_id}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
                    }}
                  />

                  {/* Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="font-medium text-white truncate text-xs md:text-sm">{getDisplayName(cam.camera_id)}</p>
                    <p className="text-xs text-gray-400">{cam.fps?.toFixed(1) ?? 0} fps</p>
                  </div>

                  {/* Live indicator */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded">
                    <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-xs font-bold text-white">MJPEG</span>
                  </div>

                  {/* Status indicator */}
                  <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${cam.fps > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              ) : (
                // Polling fallback (shouldn't normally reach here)
                <div
                  key={cam.camera_id}
                  className="relative bg-gray-700 rounded-lg overflow-hidden aspect-video cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  onDoubleClick={() => setSelectedCamera(cam)}
                >
                  <img
                    key={liveGridKey}
                    src={getSnapshotUrl(cam.camera_id, liveGridKey)}
                    alt={cam.camera_id}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
                    }}
                  />

                  {/* Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="font-medium text-white truncate text-xs md:text-sm">{getDisplayName(cam.camera_id)}</p>
                    <p className="text-xs text-gray-400">{cam.fps?.toFixed(1) ?? 0} fps</p>
                  </div>

                  {/* Live indicator */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded">
                    <span className="animate-pulse w-2 h-2 rounded-full bg-orange-500"></span>
                    <span className="text-xs font-bold text-white">LIVE</span>
                  </div>

                  {/* Status indicator */}
                  <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${cam.fps > 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              )
            ) : (
              // Snapshot mode - use CameraCard with lazy loading
              <CameraCard
                key={cam.camera_id}
                cameraId={cam.camera_id}
                fps={cam.fps}
                showFps={true}
                showStatus={true}
                compact={true}
                refreshInterval={selectedCamera ? null : refreshInterval}
                lazyLoad={true}
                thumbnailSize={320}
              />
            )
          ))}
        </div>
      </div>

      {/* Swipe hint for mobile */}
      {totalPagesMobile > 1 && (
        <p className="text-xs text-gray-500 text-center mt-3 md:hidden">
          Swipe left/right • Double-click to enlarge
        </p>
      )}
      <p className="text-xs text-gray-500 text-center mt-2 hidden md:block">
        {isLiveGrid
          ? isWebRTCLiveGrid
            ? `WebRTC ${config.resolution} streams (${activeConnections}/${maxConnections} connections)${showDetections ? ' + Detection boxes' : ''} • Double-click to view in modal`
            : `Live MJPEG streams with bounding boxes • Double-click to view in modal`
          : 'Double-click any camera to view enlarged with live stream options'}
      </p>

      {/* Camera Modal */}
      {selectedCamera && (
        <CameraFeedModal
          cameraId={selectedCamera.camera_id}
          cameraName={selectedCamera.camera_id}
          onClose={() => setSelectedCamera(null)}
        />
      )}
    </div>
  )
}

function TodayStats() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [camRes, evtRes] = await Promise.all([getCameras(), getEvents(100)])
        setCameras(camRes.data || [])
        setEvents(evtRes.data || [])
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      }
    }
    fetchData()
  }, [])

  const onlineCameras = cameras.filter(c => c.fps > 0).length
  const totalDetections = events.length
  const avgFps = cameras.length > 0
    ? (cameras.reduce((sum, c) => sum + c.fps, 0) / cameras.length).toFixed(1)
    : '0'

  const stats = [
    { label: 'Online Cameras', value: `${onlineCameras}/${cameras.length}` },
    { label: 'Detections Today', value: totalDetections.toString() },
    { label: 'Avg Camera FPS', value: avgFps },
    { label: 'Detection Types', value: [...new Set(events.map(e => e.label))].length.toString() },
  ]

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3 md:mb-4">System Stats</h3>
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-700/50 rounded-lg p-3 md:p-4">
            <p className="text-xs md:text-sm text-gray-400">{stat.label}</p>
            <p className="text-lg md:text-2xl font-bold text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentAlerts() {
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getEvents(10)
        setEvents(res.data || [])
      } catch (err) {
        console.error('Failed to fetch events:', err)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 md:p-6">
      <h3 className="text-base md:text-lg font-semibold text-gray-300 mb-3 md:mb-4">Recent Detections</h3>
      <div className="space-y-2 md:space-y-3 max-h-60 md:max-h-80 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No recent events</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-gray-700/50 rounded-lg">
              {event.has_snapshot ? (
                <img
                  src={`/frigate/api/events/${event.id}/thumbnail.jpg`}
                  alt=""
                  className="w-10 h-10 md:w-12 md:h-12 object-cover rounded flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 md:w-6 md:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-medium text-white capitalize">{event.label}</p>
                <p className="text-xs text-gray-400 truncate">{event.camera}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">{formatTime(event.start_time)}</p>
                <p className="text-xs text-gray-500">{Math.round((event.data?.score || 0) * 100)}%</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [journeyPanelCollapsed, setJourneyPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('dashboardJourneyPanelCollapsed')
    return saved === 'true'
  })
  const [viewMode, setViewMode] = useState<'cameras' | 'floorplan'>(() => {
    const saved = localStorage.getItem('dashboardViewMode')
    return (saved as 'cameras' | 'floorplan') || 'cameras'
  })

  // WebSocket for real-time updates
  const { occupancy: wsOccupancy, isConnected: isWsConnected, needsPolling } = useDashboardWebSocket()

  useEffect(() => {
    localStorage.setItem('dashboardJourneyPanelCollapsed', String(journeyPanelCollapsed))
  }, [journeyPanelCollapsed])

  useEffect(() => {
    localStorage.setItem('dashboardViewMode', viewMode)
  }, [viewMode])

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Top row - stacks on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <OccupancyCard
          wsOccupancy={wsOccupancy}
          isWsConnected={isWsConnected}
          needsPolling={needsPolling}
        />
        <QueueStatusWidget zone="entrance" />
        <TodayStats />
        <RecentAlerts />
      </div>

      <OccupancyChart />

      {/* View Mode Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">View:</span>
        <div className="flex bg-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('cameras')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
              viewMode === 'cameras'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Camera Grid
          </button>
          <button
            onClick={() => setViewMode('floorplan')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
              viewMode === 'floorplan'
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Floor Plan
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'cameras' ? (
        <>
          {/* Camera Grid with Journey Panel */}
          <div className="flex gap-4">
            <div className="flex-1">
              <CameraGrid />
            </div>
            {/* Journey Panel - collapsible sidebar */}
            <div className={`transition-all duration-300 ${journeyPanelCollapsed ? 'w-12' : 'w-80'} hidden lg:block`}>
              <JourneyPanel
                collapsed={journeyPanelCollapsed}
                onToggle={() => setJourneyPanelCollapsed(!journeyPanelCollapsed)}
              />
            </div>
          </div>

          {/* Journey Panel - full width on smaller screens */}
          <div className="lg:hidden">
            <JourneyPanel />
          </div>
        </>
      ) : (
        /* Floor Plan View */
        <FloorPlanView />
      )}
    </div>
  )
}
