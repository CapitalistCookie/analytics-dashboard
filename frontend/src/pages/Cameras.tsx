import { useState, useEffect } from 'react'
import {
  getCameras, getCameraHealth, getCameraHealthSummary, getCameraSettings,
  restartCameraStream, toggleCameraDetection, toggleCameraRecordings,
  getCameraUptimeHistory,
  type Camera, type CameraHealth, type CameraHealthSummary, type CameraSettings, type CameraUptimeHistory
} from '../api/client'
import CameraFeedModal, { type ViewMode } from '../components/CameraFeedModal'
import WebRTCGridCard from '../components/WebRTCGridCard'
import { useStreamQuality, QUALITY_CONFIGS, type StreamQuality } from '../context/StreamQualityContext'
import { useCamera } from '../context/CameraContext'
import { useWebRTCConnectionManager } from '../context/WebRTCConnectionManager'

type TabType = 'grid' | 'health' | 'settings'

const VIEW_MODE_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'Snapshots', value: 'snapshot' },
  { label: 'Live Stream', value: 'live' },
  { label: 'Detection', value: 'detection' },
]

const REFRESH_OPTIONS = [
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: 'Off', value: null },
]

interface CameraSettingsModalProps {
  camera: CameraSettings | null
  onClose: () => void
  onToggleDetection: (enabled: boolean) => Promise<void>
  onToggleRecording: (enabled: boolean) => Promise<void>
  onRestart: () => Promise<void>
}

function CameraSettingsModal({ camera, onClose, onToggleDetection, onToggleRecording, onRestart }: CameraSettingsModalProps) {
  const [loading, setLoading] = useState<string | null>(null)

  if (!camera) return null

  const handleToggle = async (type: 'detection' | 'recording') => {
    setLoading(type)
    try {
      if (type === 'detection') {
        await onToggleDetection(!camera.detection_enabled)
      } else {
        await onToggleRecording(!camera.recording_enabled)
      }
    } finally {
      setLoading(null)
    }
  }

  const handleRestart = async () => {
    setLoading('restart')
    try {
      await onRestart()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl border border-gray-700 max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Camera Settings: {camera.camera_id}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Snapshot Preview */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Snapshot Preview</h4>
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <img
                src={`/frigate/api/${camera.camera_id}/latest.jpg?t=${Date.now()}`}
                alt={`${camera.camera_id} snapshot`}
                className="w-full h-48 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Feed</text></svg>'
                }}
              />
            </div>
          </div>

          {/* Stream Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm text-gray-400 mb-1">RTSP URL</h4>
              <p className="text-white font-mono text-sm break-all">{camera.rtsp_url || 'Not configured'}</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="text-sm text-gray-400 mb-1">Detection Resolution</h4>
              <p className="text-white">{camera.detect_width} x {camera.detect_height} @ {camera.detect_fps} FPS</p>
            </div>
          </div>

          {/* Motion Settings */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h4 className="text-sm text-gray-400 mb-3">Motion Detection Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Motion Threshold</label>
                <p className="text-white">{camera.motion_threshold}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Contour Area</label>
                <p className="text-white">{camera.motion_contour_area}</p>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <h4 className="text-white font-medium">Detection</h4>
                <p className="text-sm text-gray-400">Enable/disable object detection</p>
              </div>
              <button
                onClick={() => handleToggle('detection')}
                disabled={loading === 'detection'}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  camera.detection_enabled ? 'bg-blue-600' : 'bg-gray-600'
                } ${loading === 'detection' ? 'opacity-50' : ''}`}
              >
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  camera.detection_enabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <h4 className="text-white font-medium">Recording</h4>
                <p className="text-sm text-gray-400">Enable/disable video recording</p>
              </div>
              <button
                onClick={() => handleToggle('recording')}
                disabled={loading === 'recording'}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  camera.recording_enabled ? 'bg-blue-600' : 'bg-gray-600'
                } ${loading === 'recording' ? 'opacity-50' : ''}`}
              >
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  camera.recording_enabled ? 'left-8' : 'left-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
              <div>
                <h4 className="text-white font-medium">Snapshots</h4>
                <p className="text-sm text-gray-400">Enable/disable snapshot saving</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm ${
                camera.snapshots_enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'
              }`}>
                {camera.snapshots_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              disabled={loading === 'restart'}
              className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading === 'restart' ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Restart Stream
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Note: To modify RTSP URL or advanced settings, edit the Frigate configuration file directly.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Cameras() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [cameraHealth, setCameraHealth] = useState<CameraHealth[]>([])
  const [healthSummary, setHealthSummary] = useState<CameraHealthSummary | null>(null)
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null)
  const [selectedCameraSettings, setSelectedCameraSettings] = useState<CameraSettings | null>(null)
  const [, setUptimeHistory] = useState<CameraUptimeHistory | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('health')
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('camerasViewMode')
    return (saved as ViewMode) || 'snapshot'
  })
  const [refreshInterval, setRefreshInterval] = useState<number | null>(() => {
    const saved = localStorage.getItem('camerasRefreshInterval')
    return saved ? JSON.parse(saved) : 5000
  })
  const [imageKey, setImageKey] = useState(Date.now())
  const [enlargedCamera, setEnlargedCamera] = useState<string | null>(null)
  const [livePollingKey, setLivePollingKey] = useState(Date.now())
  const [showDetections, setShowDetections] = useState(() => {
    const saved = localStorage.getItem('camerasShowDetections')
    return saved === 'true'
  })
  const { quality, setQuality, config, getSnapshotUrl, getLiveUrl } = useStreamQuality()
  const { getDisplayName } = useCamera()
  const { activeConnections, maxConnections } = useWebRTCConnectionManager()

  // Determine live mode type
  const isWebRTCLiveMode = viewMode === 'live' && config.liveMode === 'webrtc'
  const isMJPEGLiveMode = viewMode === 'live' && config.liveMode === 'mjpeg'
  const isPollingLiveMode = viewMode === 'live' && config.liveMode === 'polling'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [camerasRes, healthRes, summaryRes] = await Promise.all([
          getCameras(),
          getCameraHealth(),
          getCameraHealthSummary()
        ])
        setCameras(camerasRes.data || [])
        setCameraHealth(healthRes.data || [])
        setHealthSummary(summaryRes.data)
      } catch (err) {
        console.error('Failed to fetch camera data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('camerasViewMode', viewMode)
  }, [viewMode])

  // Save refresh interval preference
  useEffect(() => {
    localStorage.setItem('camerasRefreshInterval', JSON.stringify(refreshInterval))
  }, [refreshInterval])

  // Save show detections preference
  useEffect(() => {
    localStorage.setItem('camerasShowDetections', String(showDetections))
  }, [showDetections])

  // Auto-refresh images for snapshot/detection modes (pause when modal is open)
  useEffect(() => {
    if (viewMode === 'live' || refreshInterval === null || enlargedCamera) return

    const interval = setInterval(() => {
      setImageKey(Date.now())
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [refreshInterval, viewMode, enlargedCamera])

  // Live polling mode - only for actual polling mode (not WebRTC)
  // WebRTCGridCard handles its own polling for fallback cameras
  useEffect(() => {
    // Don't poll when using WebRTC mode (it handles its own fallback polling)
    if (isWebRTCLiveMode || !viewMode || viewMode !== 'live' || enlargedCamera) return
    // Only poll for explicit polling mode
    if (!isPollingLiveMode) return

    const interval = setInterval(() => {
      setLivePollingKey(Date.now())
    }, 500) // 2 fps for fallback

    return () => clearInterval(interval)
  }, [isWebRTCLiveMode, isPollingLiveMode, viewMode, enlargedCamera])

  const handleOpenSettings = async (cameraId: string) => {
    try {
      const [settingsRes, historyRes] = await Promise.all([
        getCameraSettings(cameraId),
        getCameraUptimeHistory(cameraId, 24)
      ])
      setSelectedCameraSettings(settingsRes.data)
      setUptimeHistory(historyRes.data)
    } catch (err) {
      console.error('Failed to fetch camera settings:', err)
    }
  }

  const handleToggleDetection = async (enabled: boolean) => {
    if (!selectedCameraSettings) return
    try {
      await toggleCameraDetection(selectedCameraSettings.camera_id, enabled)
      setSelectedCameraSettings(prev => prev ? { ...prev, detection_enabled: enabled } : null)
      // Refresh health data
      const healthRes = await getCameraHealth()
      setCameraHealth(healthRes.data || [])
    } catch (err) {
      console.error('Failed to toggle detection:', err)
    }
  }

  const handleToggleRecording = async (enabled: boolean) => {
    if (!selectedCameraSettings) return
    try {
      await toggleCameraRecordings(selectedCameraSettings.camera_id, enabled)
      setSelectedCameraSettings(prev => prev ? { ...prev, recording_enabled: enabled } : null)
    } catch (err) {
      console.error('Failed to toggle recording:', err)
    }
  }

  const handleRestart = async () => {
    if (!selectedCameraSettings) return
    try {
      await restartCameraStream(selectedCameraSettings.camera_id)
    } catch (err) {
      console.error('Failed to restart camera:', err)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'degraded': return 'bg-yellow-500'
      case 'offline': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500/20 text-green-400 border-green-700'
      case 'degraded': return 'bg-yellow-500/20 text-yellow-400 border-yellow-700'
      case 'offline': return 'bg-red-500/20 text-red-400 border-red-700'
      default: return 'bg-gray-500/20 text-gray-400 border-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Camera Management</h2>
          <p className="text-gray-400 text-sm mt-1">Monitor camera health and configure settings</p>
        </div>
        <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
          <button
            onClick={() => setActiveTab('health')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'health' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Health
          </button>
          <button
            onClick={() => setActiveTab('grid')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Grid View
          </button>
        </div>
      </div>

      {/* Health Summary Cards */}
      {healthSummary && activeTab === 'health' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Cameras</p>
            <p className="text-3xl font-bold text-white">{healthSummary.total_cameras}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Online</p>
            <p className="text-3xl font-bold text-green-400">{healthSummary.online}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Degraded</p>
            <p className="text-3xl font-bold text-yellow-400">{healthSummary.degraded}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Offline</p>
            <p className="text-3xl font-bold text-red-400">{healthSummary.offline}</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {healthSummary && healthSummary.alerts.length > 0 && activeTab === 'health' && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <h3 className="text-red-400 font-medium mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Camera Alerts ({healthSummary.alerts.length})
          </h3>
          <div className="space-y-2">
            {healthSummary.alerts.map((alert, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{alert.message}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'health' && (
        /* Camera Health List */
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Camera</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">FPS</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Latency</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Uptime</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Disk Usage</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Last Seen</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {cameraHealth.map((cam) => (
                  <tr key={cam.camera_id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(cam.status)}`} />
                        <div>
                          <p className="text-white font-medium">{getDisplayName(cam.camera_id)}</p>
                          <p className="text-xs text-gray-500">{cam.camera_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs border ${getStatusBadge(cam.status)}`}>
                        {cam.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white">{cam.fps.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">detect: {cam.detection_fps.toFixed(1)}</div>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {cam.latency_ms ? `${cam.latency_ms.toFixed(0)}ms` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              cam.uptime_percent >= 99 ? 'bg-green-500' :
                              cam.uptime_percent >= 95 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${cam.uptime_percent}%` }}
                          />
                        </div>
                        <span className="text-white text-sm">{cam.uptime_percent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {cam.disk_usage_mb > 0 ? `${cam.disk_usage_mb.toFixed(1)} MB` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {cam.last_seen ? new Date(cam.last_seen).toLocaleTimeString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenSettings(cam.camera_id)}
                          className="px-3 py-1 text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors"
                        >
                          Settings
                        </button>
                        <button
                          onClick={() => restartCameraStream(cam.camera_id)}
                          className="px-3 py-1 text-sm bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 rounded transition-colors"
                          title="Restart stream"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'grid' && (
        <>
          {/* View Mode and Refresh Controls */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">View Mode:</span>
                <div className="flex bg-gray-700 rounded-lg p-0.5">
                  {VIEW_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setViewMode(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Selector */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Quality:</span>
                <div className="flex bg-gray-700 rounded-lg p-0.5">
                  {(['low', 'medium', 'high'] as StreamQuality[]).map(q => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors capitalize ${
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
                <span className="text-xs text-gray-500">{config.resolution}</span>
              </div>

              {/* Detection toggle - visible in Live mode */}
              {viewMode === 'live' && isWebRTCLiveMode && (
                <button
                  onClick={() => setShowDetections(!showDetections)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    showDetections
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                  }`}
                  title={showDetections ? 'Hide detection boxes' : 'Show detection boxes'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  {showDetections ? 'Boxes ON' : 'Boxes'}
                </button>
              )}

              {/* Refresh Controls (only for snapshot/detection modes) */}
              {viewMode !== 'live' && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">Refresh:</span>
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
                  <button
                    onClick={() => setImageKey(Date.now())}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                    title="Refresh now"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {viewMode === 'live'
                ? isWebRTCLiveMode
                  ? `WebRTC ${config.resolution} streams (${activeConnections}/${maxConnections} connections)${showDetections ? ' + Detection boxes' : ''}. Double-click any camera to enlarge.`
                  : isMJPEGLiveMode
                    ? 'Live MJPEG stream with bounding boxes (720p). Double-click any camera to enlarge.'
                    : `Live HD stream (${config.resolution} @ 2fps polling). Double-click any camera to enlarge.`
                : viewMode === 'detection'
                ? 'Snapshots with bounding boxes from Frigate detect stream. Double-click any camera to view with overlay.'
                : `${config.resolution} snapshots refreshed at selected interval. Double-click any camera to enlarge.`}
            </p>
          </div>

          {/* Selected Camera Preview */}
          {selectedCamera && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">{getDisplayName(selectedCamera)}</h3>
                <button
                  onClick={() => setSelectedCamera(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="relative">
                {viewMode === 'live' ? (
                  isPollingLiveMode ? (
                    // Polling-based live for Medium/High quality
                    <img
                      key={livePollingKey}
                      src={getSnapshotUrl(selectedCamera, livePollingKey)}
                      alt={`${selectedCamera} live stream`}
                      className="w-full max-h-96 object-contain rounded"
                    />
                  ) : (
                    // True MJPEG for Low quality
                    <img
                      src={getLiveUrl(selectedCamera, true)}
                      alt={`${selectedCamera} live stream`}
                      className="w-full max-h-96 object-contain rounded"
                    />
                  )
                ) : viewMode === 'detection' ? (
                  <img
                    key={imageKey}
                    src={`/frigate/api/${selectedCamera}/latest.jpg?t=${imageKey}&bbox=1`}
                    alt={selectedCamera}
                    className="w-full max-h-96 object-contain rounded"
                  />
                ) : (
                  <img
                    key={imageKey}
                    src={getSnapshotUrl(selectedCamera, imageKey)}
                    alt={selectedCamera}
                    className="w-full max-h-96 object-contain rounded"
                  />
                )}
                {viewMode === 'live' && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
                    <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-xs font-bold text-white">{isPollingLiveMode ? 'LIVE HD' : 'LIVE'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Camera Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cameras.map((cam, index) => {
              const health = cameraHealth.find(h => h.camera_id === cam.camera_id)

              // Use WebRTCGridCard for WebRTC live mode
              if (viewMode === 'live' && isWebRTCLiveMode) {
                return (
                  <WebRTCGridCard
                    key={cam.camera_id}
                    cameraId={cam.camera_id}
                    fps={cam.fps}
                    status={health?.status as 'online' | 'offline' | 'degraded' | undefined}
                    visibilityIndex={index}
                    showDetections={showDetections}
                  />
                )
              }

              return (
                <button
                  key={cam.camera_id}
                  onClick={() => setSelectedCamera(cam.camera_id)}
                  onDoubleClick={() => setEnlargedCamera(cam.camera_id)}
                  className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video hover:ring-2 hover:ring-blue-500 transition-all border border-gray-700"
                  title="Click to preview, double-click to enlarge"
                >
                  {viewMode === 'live' ? (
                    isMJPEGLiveMode ? (
                      // True MJPEG for Low quality
                      <img
                        src={getLiveUrl(cam.camera_id, true)}
                        alt={`${cam.camera_id} live stream`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
                        }}
                      />
                    ) : (
                      // Polling fallback
                      <img
                        key={livePollingKey}
                        src={getSnapshotUrl(cam.camera_id, livePollingKey)}
                        alt={`${cam.camera_id} live stream`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Stream</text></svg>'
                        }}
                      />
                    )
                  ) : viewMode === 'detection' ? (
                    <img
                      key={imageKey}
                      src={`/frigate/api/${cam.camera_id}/latest.jpg?t=${imageKey}&bbox=1`}
                      alt={cam.camera_id}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Feed</text></svg>'
                      }}
                    />
                  ) : (
                    <img
                      key={imageKey}
                      src={getSnapshotUrl(cam.camera_id, imageKey)}
                      alt={cam.camera_id}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No Feed</text></svg>'
                      }}
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-sm font-medium text-white">{getDisplayName(cam.camera_id)}</p>
                    <p className="text-xs text-gray-400">
                      {cam.fps?.toFixed(1) ?? 0} fps
                      {viewMode === 'live' && (
                        <span className={`ml-2 ${isMJPEGLiveMode ? 'text-green-400' : 'text-blue-400'}`}>
                          {isMJPEGLiveMode ? 'MJPEG' : 'LIVE'}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                    health ? getStatusColor(health.status) : (cam.fps > 0 ? 'bg-green-500' : 'bg-red-500')
                  }`} />
                  {health && (
                    <div className="absolute top-2 left-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusBadge(health.status)}`}>
                        {health.status}
                      </span>
                    </div>
                  )}
                  {/* Zoom hint */}
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                    <div className="bg-black/50 rounded p-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Camera Settings Modal */}
      {selectedCameraSettings && (
        <CameraSettingsModal
          camera={selectedCameraSettings}
          onClose={() => { setSelectedCameraSettings(null); setUptimeHistory(null) }}
          onToggleDetection={handleToggleDetection}
          onToggleRecording={handleToggleRecording}
          onRestart={handleRestart}
        />
      )}

      {/* Enlarged Camera Modal */}
      {enlargedCamera && (
        <CameraFeedModal
          cameraId={enlargedCamera}
          cameraName={getDisplayName(enlargedCamera)}
          onClose={() => setEnlargedCamera(null)}
          initialMode={viewMode}
        />
      )}
    </div>
  )
}
