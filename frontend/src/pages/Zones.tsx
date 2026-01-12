import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getZones, createZone, updateZone, deleteZone, getZoneTypes,
  getCameras, getZoneDetectionPreview, saveZoneToFrigate,
  type Zone, type ZoneCreate, type ZoneUpdate, type ZoneType, type PolygonPoint, type Camera
} from '../api/client'

interface ZoneModalProps {
  zone: Zone | null
  zoneTypes: ZoneType[]
  cameras: Camera[]
  onClose: () => void
  onSave: (data: ZoneCreate | ZoneUpdate) => void
}

function ZoneModal({ zone, zoneTypes, cameras, onClose, onSave }: ZoneModalProps) {
  const [name, setName] = useState(zone?.name || '')
  const [zoneType, setZoneType] = useState(zone?.zone_type || 'dining')
  const [capacity, setCapacity] = useState(zone?.capacity?.toString() || '')
  const [selectedCameras, setSelectedCameras] = useState<string[]>(zone?.camera_ids || [])
  const [color, setColor] = useState(zone?.color || '#8b5cf6')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      zone_type: zoneType,
      capacity: capacity ? parseInt(capacity) : undefined,
      camera_ids: selectedCameras,
      color,
      polygon: zone?.polygon || undefined
    })
  }

  const toggleCamera = (camId: string) => {
    setSelectedCameras(prev =>
      prev.includes(camId) ? prev.filter(c => c !== camId) : [...prev, camId]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4">
          {zone ? 'Edit Zone' : 'Create Zone'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Zone Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Main Dining Area"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Zone Type</label>
            <select
              value={zoneType}
              onChange={(e) => {
                setZoneType(e.target.value)
                const type = zoneTypes.find(t => t.id === e.target.value)
                if (type) setColor(type.color)
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            >
              {zoneTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name} - {type.description}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Capacity</label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Max people"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-16 bg-gray-700 border border-gray-600 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Assign Cameras</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto bg-gray-700/50 p-3 rounded-lg border border-gray-600">
              {cameras.map(cam => (
                <button
                  key={cam.camera_id}
                  type="button"
                  onClick={() => toggleCamera(cam.camera_id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedCameras.includes(cam.camera_id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  {cam.camera_id}
                </button>
              ))}
              {cameras.length === 0 && (
                <span className="text-gray-500 text-sm">No cameras available</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {zone ? 'Save Changes' : 'Create Zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ZoneEditorProps {
  zone: Zone
  cameras: Camera[]
  onSave: (polygon: PolygonPoint[]) => void
  onClose: () => void
}

function ZoneEditor({ zone, cameras, onSave, onClose }: ZoneEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<PolygonPoint[]>(zone.polygon || [])
  const [selectedCamera, setSelectedCamera] = useState(zone.camera_ids[0] || cameras[0]?.camera_id || '')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 640, height: 480 })

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (points.length === 0) return

    // Draw polygon fill
    ctx.fillStyle = (zone.color || '#8b5cf6') + '40' // 25% opacity
    ctx.beginPath()
    ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * canvas.width, points[i].y * canvas.height)
    }
    ctx.closePath()
    ctx.fill()

    // Draw polygon outline
    ctx.strokeStyle = zone.color || '#8b5cf6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(points[0].x * canvas.width, points[0].y * canvas.height)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * canvas.width, points[i].y * canvas.height)
    }
    ctx.closePath()
    ctx.stroke()

    // Draw points
    points.forEach((point, index) => {
      ctx.fillStyle = index === 0 ? '#22c55e' : zone.color || '#8b5cf6'
      ctx.beginPath()
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw point number
      ctx.fillStyle = '#fff'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText((index + 1).toString(), point.x * canvas.width, point.y * canvas.height + 3)
    })
  }, [points, zone.color])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    setPoints(prev => [...prev, { x, y }])
  }

  const handleClear = () => {
    setPoints([])
  }

  const handleUndo = () => {
    setPoints(prev => prev.slice(0, -1))
  }

  const handleSave = () => {
    if (points.length >= 3) {
      onSave(points)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl border border-gray-700 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">Edit Zone: {zone.name}</h3>
            <p className="text-sm text-gray-400">Click on the image to draw zone boundary (min 3 points)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex gap-4">
          <div className="flex-1">
            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">Camera Feed</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              >
                {cameras.map(cam => (
                  <option key={cam.camera_id} value={cam.camera_id}>{cam.camera_id}</option>
                ))}
              </select>
            </div>

            <div ref={containerRef} className="relative bg-gray-900 rounded-lg overflow-hidden">
              <img
                src={`/frigate/api/${selectedCamera}/latest.jpg?t=${Date.now()}`}
                alt="Camera feed"
                className="w-full h-auto"
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement
                  setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                  setImageLoaded(true)
                }}
                onError={() => setImageLoaded(false)}
              />
              <canvas
                ref={canvasRef}
                width={imageDimensions.width}
                height={imageDimensions.height}
                onClick={handleCanvasClick}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                style={{ pointerEvents: imageLoaded ? 'auto' : 'none' }}
              />
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-500">Camera feed unavailable</span>
                </div>
              )}
            </div>
          </div>

          <div className="w-48 space-y-3">
            <div className="bg-gray-700 rounded-lg p-3">
              <h4 className="text-sm font-medium text-white mb-2">Points ({points.length})</h4>
              <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                {points.map((p, i) => (
                  <div key={i} className="flex justify-between text-gray-400">
                    <span>Point {i + 1}</span>
                    <span>({(p.x * 100).toFixed(0)}%, {(p.y * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleUndo}
              disabled={points.length === 0}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
            >
              Undo Last Point
            </button>
            <button
              onClick={handleClear}
              disabled={points.length === 0}
              className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors text-sm"
            >
              Clear All
            </button>
            <button
              onClick={handleSave}
              disabled={points.length < 3}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
            >
              Save Zone
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <p className="text-xs text-gray-500">
            Tip: Click on the camera image to place polygon points. Points are saved as normalized coordinates (0-1).
            Start with the top-left corner and work clockwise.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneTypes, setZoneTypes] = useState<ZoneType[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [previewZone, setPreviewZone] = useState<number | null>(null)
  const [previewData, setPreviewData] = useState<{ count: number; detections: unknown[] } | null>(null)

  const typeColors: Record<string, string> = {
    entry: 'bg-green-900/50 text-green-300 border border-green-700',
    exit: 'bg-red-900/50 text-red-300 border border-red-700',
    service: 'bg-blue-900/50 text-blue-300 border border-blue-700',
    restricted: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
    dining: 'bg-purple-900/50 text-purple-300 border border-purple-700',
    bar: 'bg-pink-900/50 text-pink-300 border border-pink-700',
    kitchen: 'bg-orange-900/50 text-orange-300 border border-orange-700',
    waiting: 'bg-cyan-900/50 text-cyan-300 border border-cyan-700',
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [zonesRes, typesRes, camerasRes] = await Promise.all([
          getZones(),
          getZoneTypes(),
          getCameras()
        ])
        setZones(zonesRes.data)
        setZoneTypes(typesRes.data.types)
        setCameras(camerasRes.data || [])
      } catch (err) {
        console.error('Failed to fetch zones:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleCreateZone = async (data: ZoneCreate | ZoneUpdate) => {
    try {
      if (selectedZone) {
        const res = await updateZone(selectedZone.id, data as ZoneUpdate)
        setZones(zones.map(z => z.id === selectedZone.id ? res.data : z))
      } else {
        const res = await createZone(data as ZoneCreate)
        setZones([...zones, res.data])
      }
      setShowModal(false)
      setSelectedZone(null)
    } catch (err) {
      console.error('Failed to save zone:', err)
    }
  }

  const handleDeleteZone = async (id: number) => {
    try {
      await deleteZone(id)
      setZones(zones.filter(z => z.id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete zone:', err)
    }
  }

  const handleSavePolygon = async (polygon: PolygonPoint[]) => {
    if (!selectedZone) return
    try {
      const res = await updateZone(selectedZone.id, { polygon })
      setZones(zones.map(z => z.id === selectedZone.id ? res.data : z))
      setShowEditor(false)
      setSelectedZone(null)
    } catch (err) {
      console.error('Failed to save polygon:', err)
    }
  }

  const handlePreviewZone = async (zoneId: number) => {
    try {
      const res = await getZoneDetectionPreview(zoneId)
      setPreviewData({ count: res.data.current_count, detections: res.data.detections })
      setPreviewZone(zoneId)
    } catch (err) {
      console.error('Failed to get preview:', err)
    }
  }

  const handleSaveToFrigate = async (zoneId: number) => {
    try {
      await saveZoneToFrigate(zoneId)
      alert('Zone configuration prepared for Frigate. Check console for config details.')
    } catch (err) {
      console.error('Failed to save to Frigate:', err)
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
          <h2 className="text-2xl font-bold text-white">Zone Configuration</h2>
          <p className="text-gray-400 text-sm mt-1">Define detection zones for cameras</p>
        </div>
        <button
          onClick={() => { setSelectedZone(null); setShowModal(true) }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Zone
        </button>
      </div>

      {zones.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No zones configured</h3>
          <p className="text-gray-400 mb-4">Create your first zone to start tracking detections in specific areas.</p>
          <button
            onClick={() => { setSelectedZone(null); setShowModal(true) }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Create Zone
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-gray-800 rounded-lg p-4 md:p-6 border border-gray-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: zone.color || '#8b5cf6' }}
                    />
                    <h3 className="text-lg font-semibold text-white">{zone.name}</h3>
                    {!zone.is_active && (
                      <span className="px-2 py-0.5 text-xs bg-gray-600 text-gray-300 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <span className={`inline-block mt-2 px-3 py-1 text-xs rounded-full capitalize ${typeColors[zone.zone_type] || 'bg-gray-700 text-gray-300'}`}>
                    {zone.zone_type}
                  </span>
                </div>
                <div className="text-right">
                  {zone.capacity && (
                    <>
                      <p className="text-2xl font-bold text-white">{zone.capacity}</p>
                      <p className="text-xs text-gray-400">max capacity</p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Assigned Cameras</p>
                  <div className="flex flex-wrap gap-2">
                    {zone.camera_ids.length > 0 ? zone.camera_ids.map((cam) => (
                      <span key={cam} className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm border border-gray-600">
                        {cam}
                      </span>
                    )) : (
                      <span className="text-gray-500 text-sm">No cameras assigned</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Zone Polygon</p>
                  {zone.polygon && zone.polygon.length >= 3 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-sm flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {zone.polygon.length} points defined
                      </span>
                    </div>
                  ) : (
                    <span className="text-yellow-400 text-sm flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      No polygon defined
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap gap-2">
                <button
                  onClick={() => { setSelectedZone(zone); setShowEditor(true) }}
                  className="px-3 py-1.5 text-sm bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Draw Zone
                </button>
                <button
                  onClick={() => handlePreviewZone(zone.id)}
                  className="px-3 py-1.5 text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Preview
                </button>
                <button
                  onClick={() => { setSelectedZone(zone); setShowModal(true) }}
                  className="px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleSaveToFrigate(zone.id)}
                  disabled={!zone.polygon || zone.polygon.length < 3}
                  className="px-3 py-1.5 text-sm text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save to Frigate
                </button>
                <button
                  onClick={() => setDeleteConfirm(zone.id)}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                >
                  Delete
                </button>
              </div>

              {previewZone === zone.id && previewData && (
                <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Current Count:</span>
                    <span className="text-2xl font-bold text-white">{previewData.count}</span>
                  </div>
                  <button
                    onClick={() => { setPreviewZone(null); setPreviewData(null) }}
                    className="text-xs text-gray-500 hover:text-gray-400 mt-2"
                  >
                    Close preview
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Zone Create/Edit Modal */}
      {showModal && (
        <ZoneModal
          zone={selectedZone}
          zoneTypes={zoneTypes}
          cameras={cameras}
          onClose={() => { setShowModal(false); setSelectedZone(null) }}
          onSave={handleCreateZone}
        />
      )}

      {/* Zone Editor Modal */}
      {showEditor && selectedZone && (
        <ZoneEditor
          zone={selectedZone}
          cameras={cameras}
          onSave={handleSavePolygon}
          onClose={() => { setShowEditor(false); setSelectedZone(null) }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-2">Delete Zone?</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete this zone? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteZone(deleteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
