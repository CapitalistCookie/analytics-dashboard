import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getAllDetectionConfig,
  getCameraDetectionConfig,
  updateCameraDetectionConfig,
  getDetectionPresets,
  applyPresetToCamera,
  applyPresetToAllCameras,
  applyPresetToGroup,
  getConfigHistory,
  restoreConfig,
  reloadFrigateConfig,
  getCameraDetectionStats,
  CameraDetectionSettings,
  PresetsResponse,
  ConfigHistoryEntry,
  CameraStats,
  CameraDetectionSettingsUpdate,
} from '../api/client'

const FRIGATE_URL = '/api'

export default function DetectionSettings() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'manager'

  // State
  const [cameras, setCameras] = useState<Record<string, CameraDetectionSettings>>({})
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null)
  const [settings, setSettings] = useState<CameraDetectionSettings | null>(null)
  const [presets, setPresets] = useState<PresetsResponse | null>(null)
  const [history, setHistory] = useState<ConfigHistoryEntry[]>([])
  const [cameraStats, setCameraStats] = useState<CameraStats | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'detection' | 'motion' | 'presets' | 'history'>('detection')
  const [showApplyAllConfirm, setShowApplyAllConfirm] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<CameraDetectionSettingsUpdate>({})

  // Load initial data
  useEffect(() => {
    loadData()
  }, [])

  // Load camera settings when selection changes
  useEffect(() => {
    if (selectedCamera) {
      loadCameraSettings(selectedCamera)
      loadCameraStats(selectedCamera)
    }
  }, [selectedCamera])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [configRes, presetsRes, historyRes] = await Promise.all([
        getAllDetectionConfig(),
        getDetectionPresets(),
        getConfigHistory(20),
      ])
      setCameras(configRes.data.cameras)
      setPresets(presetsRes.data)
      setHistory(historyRes.data)

      // Select first camera by default
      const cameraIds = Object.keys(configRes.data.cameras)
      if (cameraIds.length > 0 && !selectedCamera) {
        setSelectedCamera(cameraIds[0])
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load detection settings')
    } finally {
      setLoading(false)
    }
  }

  const loadCameraSettings = async (cameraId: string) => {
    try {
      const res = await getCameraDetectionConfig(cameraId)
      setSettings(res.data)
      setPendingChanges({})
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to load settings for ${cameraId}`)
    }
  }

  const loadCameraStats = async (cameraId: string) => {
    try {
      const res = await getCameraDetectionStats(cameraId)
      setCameraStats(res.data)
    } catch (err) {
      setCameraStats(null)
    }
  }

  // Refresh stats periodically
  useEffect(() => {
    if (!selectedCamera) return
    const interval = setInterval(() => loadCameraStats(selectedCamera), 5000)
    return () => clearInterval(interval)
  }, [selectedCamera])

  const handleSettingChange = (
    category: 'detect' | 'motion' | 'stationary',
    key: string,
    value: number | boolean
  ) => {
    if (!settings) return

    setSettings(prev => {
      if (!prev) return prev
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [key]: value,
        },
      }
    })

    setPendingChanges(prev => ({
      ...prev,
      [category]: {
        ...((prev as any)[category] || {}),
        [key]: value,
      },
    }))
  }

  const saveChanges = async () => {
    if (!selectedCamera || Object.keys(pendingChanges).length === 0) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateCameraDetectionConfig(selectedCamera, pendingChanges)
      setSuccess('Settings saved successfully')
      setPendingChanges({})
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const applyPreset = async (presetName: string, scope: 'camera' | 'all' | 'group', groupName?: string) => {
    if (!canEdit) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      if (scope === 'camera' && selectedCamera) {
        await applyPresetToCamera(selectedCamera, presetName)
        await loadCameraSettings(selectedCamera)
        setSuccess(`Applied "${presetName}" preset to ${selectedCamera}`)
      } else if (scope === 'all') {
        await applyPresetToAllCameras(presetName)
        await loadData()
        setSuccess(`Applied "${presetName}" preset to all cameras`)
      } else if (scope === 'group' && groupName) {
        await applyPresetToGroup(groupName, presetName)
        await loadData()
        setSuccess(`Applied "${presetName}" preset to ${groupName} cameras`)
      }
      setShowApplyAllConfirm(null)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to apply preset')
    } finally {
      setSaving(false)
    }
  }

  const handleReloadConfig = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await reloadFrigateConfig()
      setSuccess('Frigate config reload triggered')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reload Frigate config')
    } finally {
      setSaving(false)
    }
  }

  const handleRestoreConfig = async (historyId: string) => {
    if (!window.confirm('Are you sure you want to restore this configuration?')) return

    setSaving(true)
    setError(null)

    try {
      await restoreConfig(historyId)
      setSuccess('Configuration restored')
      await loadData()
      if (selectedCamera) {
        await loadCameraSettings(selectedCamera)
      }
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to restore configuration')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = () => {
    if (!settings) return
    handleSettingChange('detect', 'min_area', 2500)
    handleSettingChange('detect', 'max_area', 100000)
    handleSettingChange('detect', 'threshold', 0.7)
    handleSettingChange('detect', 'min_score', 0.5)
    handleSettingChange('detect', 'max_disappeared', 75)
    handleSettingChange('motion', 'threshold', 25)
    handleSettingChange('motion', 'contour_area', 100)
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Detection Settings</h1>
          <p className="text-gray-400 mt-1">Tune Frigate detection sensitivity per camera</p>
        </div>
        <div className="flex items-center gap-3">
          {cameraStats && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${cameraStats.detection_enabled ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-gray-400">
                {cameraStats.detection_fps.toFixed(1)} FPS
              </span>
            </div>
          )}
          {canEdit && (
            <button
              onClick={handleReloadConfig}
              disabled={saving}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Reload Frigate
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Camera selector and preview */}
        <div className="lg:col-span-1 space-y-4">
          {/* Camera selector */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Select Camera</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {Object.keys(cameras).map(cameraId => (
                <button
                  key={cameraId}
                  onClick={() => setSelectedCamera(cameraId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedCamera === cameraId
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {cameraId}
                </button>
              ))}
            </div>
          </div>

          {/* Camera preview */}
          {selectedCamera && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Live Preview</h3>
              <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
                <img
                  src={`${FRIGATE_URL}/${selectedCamera}/latest.jpg?h=240`}
                  alt={selectedCamera}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = ''
                    ;(e.target as HTMLImageElement).alt = 'Preview unavailable'
                  }}
                />
                {/* Min area size indicator */}
                {settings && (
                  <div
                    className="absolute border-2 border-yellow-400 bg-yellow-400/20"
                    style={{
                      width: `${Math.sqrt(settings.detect.min_area || 2500) / 4}px`,
                      height: `${Math.sqrt(settings.detect.min_area || 2500) / 4}px`,
                      bottom: '8px',
                      right: '8px',
                    }}
                    title={`Min detection size: ${settings.detect.min_area}px²`}
                  >
                    <span className="absolute -top-5 right-0 text-xs text-yellow-400">
                      min size
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Yellow box shows minimum detection size
              </p>
            </div>
          )}
        </div>

        {/* Right: Settings panels */}
        <div className="lg:col-span-3">
          {/* Tabs */}
          <div className="bg-gray-800 rounded-lg">
            <div className="border-b border-gray-700">
              <nav className="flex -mb-px">
                {(['detection', 'motion', 'presets', 'history'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-3 text-sm font-medium border-b-2 capitalize ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* Detection Settings Tab */}
              {activeTab === 'detection' && settings && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-white">Detection Parameters</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={resetToDefaults}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                      >
                        Reset to Defaults
                      </button>
                      {Object.keys(pendingChanges).length > 0 && canEdit && (
                        <button
                          onClick={saveChanges}
                          disabled={saving}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Min Area */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Minimum Area (px²)
                      </label>
                      <span className="text-sm text-gray-400">
                        {settings.detect.min_area || 2500}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="20000"
                      step="100"
                      value={settings.detect.min_area || 2500}
                      onChange={(e) => handleSettingChange('detect', 'min_area', parseInt(e.target.value))}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Objects smaller than this area will be ignored. Lower = more sensitive.
                    </p>
                  </div>

                  {/* Max Area */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Maximum Area (px²)
                      </label>
                      <span className="text-sm text-gray-400">
                        {settings.detect.max_area || 100000}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10000"
                      max="200000"
                      step="1000"
                      value={settings.detect.max_area || 100000}
                      onChange={(e) => handleSettingChange('detect', 'max_area', parseInt(e.target.value))}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Objects larger than this area will be ignored.
                    </p>
                  </div>

                  {/* Detection Threshold */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Detection Threshold
                      </label>
                      <span className="text-sm text-gray-400">
                        {((settings.detect.threshold || 0.7) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="95"
                      step="5"
                      value={(settings.detect.threshold || 0.7) * 100}
                      onChange={(e) => handleSettingChange('detect', 'threshold', parseInt(e.target.value) / 100)}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Confidence required to register a detection. Lower = more detections.
                    </p>
                  </div>

                  {/* Min Score */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Minimum Score
                      </label>
                      <span className="text-sm text-gray-400">
                        {((settings.detect.min_score || 0.5) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      step="5"
                      value={(settings.detect.min_score || 0.5) * 100}
                      onChange={(e) => handleSettingChange('detect', 'min_score', parseInt(e.target.value) / 100)}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Minimum confidence to consider for tracking.
                    </p>
                  </div>

                  {/* Max Disappeared */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Max Disappeared Frames
                      </label>
                      <span className="text-sm text-gray-400">
                        {settings.detect.max_disappeared || 75}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="200"
                      step="5"
                      value={settings.detect.max_disappeared || 75}
                      onChange={(e) => handleSettingChange('detect', 'max_disappeared', parseInt(e.target.value))}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Frames before an object is considered gone. Higher = longer tracking.
                    </p>
                  </div>
                </div>
              )}

              {/* Motion Settings Tab */}
              {activeTab === 'motion' && settings && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-white">Motion Detection</h3>
                    {Object.keys(pendingChanges).length > 0 && canEdit && (
                      <button
                        onClick={saveChanges}
                        disabled={saving}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    )}
                  </div>

                  {/* Motion Threshold */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Motion Threshold
                      </label>
                      <span className="text-sm text-gray-400">
                        {settings.motion.threshold || 25}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="1"
                      value={settings.motion.threshold || 25}
                      onChange={(e) => handleSettingChange('motion', 'threshold', parseInt(e.target.value))}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Pixel difference threshold for motion. Lower = more sensitive to small movements.
                    </p>
                  </div>

                  {/* Contour Area */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Contour Area
                      </label>
                      <span className="text-sm text-gray-400">
                        {settings.motion.contour_area || 100}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="10"
                      value={settings.motion.contour_area || 100}
                      onChange={(e) => handleSettingChange('motion', 'contour_area', parseInt(e.target.value))}
                      disabled={!canEdit}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Minimum contour area to trigger motion. Lower = more sensitive.
                    </p>
                  </div>

                  {/* Stationary Settings */}
                  <div className="mt-8">
                    <h4 className="text-md font-medium text-white mb-4">Stationary Detection</h4>

                    {/* Stationary Interval */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">
                          Stationary Check Interval
                        </label>
                        <span className="text-sm text-gray-400">
                          {settings.stationary.interval || 50} frames
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={settings.stationary.interval || 50}
                        onChange={(e) => handleSettingChange('stationary', 'interval', parseInt(e.target.value))}
                        disabled={!canEdit}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        How often to check if an object has become stationary. 0 = disabled.
                      </p>
                    </div>

                    {/* Stationary Threshold */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">
                          Stationary Threshold
                        </label>
                        <span className="text-sm text-gray-400">
                          {settings.stationary.threshold || 50} frames
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="150"
                        step="5"
                        value={settings.stationary.threshold || 50}
                        onChange={(e) => handleSettingChange('stationary', 'threshold', parseInt(e.target.value))}
                        disabled={!canEdit}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Frames an object must be still before considered stationary.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Presets Tab */}
              {activeTab === 'presets' && presets && (
                <div className="space-y-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-white">Quick Presets</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Apply pre-configured settings optimized for different scenarios
                    </p>
                  </div>

                  {/* Built-in Presets */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(presets.builtin).map(([key, preset]) => (
                      <div
                        key={key}
                        className="bg-gray-700/50 rounded-lg p-4 border border-gray-600"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-white">{preset.name}</h4>
                            <p className="text-sm text-gray-400 mt-1">{preset.description}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => applyPreset(key, 'camera')}
                            disabled={!canEdit || saving || !selectedCamera}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                          >
                            Apply to {selectedCamera || 'Camera'}
                          </button>
                          <button
                            onClick={() => setShowApplyAllConfirm(key)}
                            disabled={!canEdit || saving}
                            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm disabled:opacity-50"
                          >
                            All
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Camera Groups */}
                  <div className="mt-8">
                    <h4 className="text-md font-medium text-white mb-4">Camera Groups</h4>
                    <p className="text-sm text-gray-400 mb-4">
                      Apply presets to predefined camera groups
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {Object.entries(presets.camera_groups).map(([group, cameraIds]) => (
                        <div
                          key={group}
                          className="bg-gray-700/50 rounded-lg p-4 border border-gray-600"
                        >
                          <h5 className="font-medium text-white capitalize">{group}</h5>
                          <p className="text-xs text-gray-400 mt-1">
                            {cameraIds.join(', ')}
                          </p>
                          <div className="mt-3">
                            <select
                              className="w-full bg-gray-600 text-white rounded px-3 py-2 text-sm"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  applyPreset(e.target.value, 'group', group)
                                  e.target.value = ''
                                }
                              }}
                              disabled={!canEdit || saving}
                            >
                              <option value="">Apply preset...</option>
                              {Object.entries(presets.builtin).map(([key, preset]) => (
                                <option key={key} value={key}>{preset.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom Presets */}
                  {Object.keys(presets.custom).length > 0 && (
                    <div className="mt-8">
                      <h4 className="text-md font-medium text-white mb-4">Custom Presets</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(presets.custom).map(([key, preset]) => (
                          <div
                            key={key}
                            className="bg-gray-700/50 rounded-lg p-4 border border-purple-600/50"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-white">{preset.name}</h4>
                                <p className="text-sm text-gray-400 mt-1">{preset.description}</p>
                              </div>
                              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">
                                Custom
                              </span>
                            </div>
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={() => applyPreset(key, 'camera')}
                                disabled={!canEdit || saving || !selectedCamera}
                                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-white">Configuration History</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      View and restore previous configurations
                    </p>
                  </div>

                  {history.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No configuration history available
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between bg-gray-700/50 rounded-lg p-4 border border-gray-600"
                        >
                          <div>
                            <p className="text-sm text-white">{entry.reason}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(entry.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRestoreConfig(entry.id)}
                            disabled={!canEdit || saving}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm disabled:opacity-50"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Apply All Confirmation Modal */}
      {showApplyAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-white mb-2">
              Apply Preset to All Cameras?
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              This will apply the "{presets?.builtin[showApplyAllConfirm]?.name}" preset to all
              cameras. This action will override current settings.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowApplyAllConfirm(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => applyPreset(showApplyAllConfirm, 'all')}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                {saving ? 'Applying...' : 'Apply to All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
