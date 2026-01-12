import { useState, useEffect } from 'react'
import {
  getStaff,
  getRegularCustomers,
  type Staff,
  type TrackedPerson,
} from '../api/client'
import type { Detection } from './DetectionOverlay'

const ROLES = ['server', 'host', 'bartender', 'manager', 'chef', 'busser', 'kitchen']

// Simple inline SVG icons
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

const UserIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
)

const UsersIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
)

const EyeIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
)

const UserPlusIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="8.5" cy="7" r="4"></circle>
    <line x1="20" y1="8" x2="20" y2="14"></line>
    <line x1="23" y1="11" x2="17" y2="11"></line>
  </svg>
)

const CheckIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

const LoaderIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
  </svg>
)

const StarIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
)

interface LabelingModalProps {
  isOpen: boolean
  detection: Detection | null
  cameraId: string
  imageData: string | null // Base64 image of the detected person
  personId?: number | null // If detection is already linked to a tracked person
  onClose: () => void
  onLabelAsStaff: (staffId: number, addPhoto: boolean) => Promise<void>
  onCreateStaff: (name: string, role: string, imageData: string) => Promise<Staff>
  onLabelAsCustomer: () => void
  onLabelAsRegular: (personId: number, name: string, notes?: string) => Promise<void>
  onIgnore: () => void
}

type LabelMode = 'select' | 'existing' | 'new' | 'regular' | 'regular-new'

export default function LabelingModal({
  isOpen,
  detection,
  cameraId,
  imageData,
  personId,
  onClose,
  onLabelAsStaff,
  onCreateStaff,
  onLabelAsCustomer,
  onLabelAsRegular,
  onIgnore,
}: LabelingModalProps) {
  const [mode, setMode] = useState<LabelMode>('select')
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [regularsList, setRegularsList] = useState<TrackedPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const [selectedRegularId, setSelectedRegularId] = useState<number | null>(null)
  const [addPhotoToExisting, setAddPhotoToExisting] = useState(true)

  // New staff form
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('server')

  // New regular form
  const [regularName, setRegularName] = useState('')
  const [regularNotes, setRegularNotes] = useState('')

  // Load staff list when modal opens
  useEffect(() => {
    if (isOpen) {
      loadStaffList()
      loadRegularsList()
      // Reset state
      setMode('select')
      setSearchQuery('')
      setSelectedStaffId(null)
      setSelectedRegularId(null)
      setAddPhotoToExisting(true)
      setNewName('')
      setNewRole('server')
      setRegularName('')
      setRegularNotes('')
      setError(null)
    }
  }, [isOpen])

  const loadStaffList = async () => {
    setLoading(true)
    try {
      const res = await getStaff()
      setStaffList(res.data.staff.filter(s => s.is_active))
    } catch (err) {
      console.error('Failed to load staff list:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadRegularsList = async () => {
    try {
      const res = await getRegularCustomers(50)
      setRegularsList(res.data.regulars || [])
    } catch (err) {
      console.error('Failed to load regulars list:', err)
    }
  }

  const filteredStaff = staffList.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredRegulars = regularsList.filter(r =>
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.display_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectExistingStaff = async () => {
    if (!selectedStaffId) return
    setSaving(true)
    setError(null)
    try {
      await onLabelAsStaff(selectedStaffId, addPhotoToExisting)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to label as staff')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNewStaff = async () => {
    if (!newName.trim()) {
      setError('Name is required')
      return
    }
    if (!imageData) {
      setError('No image captured for face training')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreateStaff(newName.trim(), newRole, imageData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff')
    } finally {
      setSaving(false)
    }
  }

  const handleLabelAsCustomer = () => {
    onLabelAsCustomer()
    onClose()
  }

  const handleIgnore = () => {
    onIgnore()
    onClose()
  }

  const handleSelectExistingRegular = async () => {
    if (!selectedRegularId) return
    // If we have a personId for this detection, merge them
    // Otherwise we can't link - the detection needs to be matched first
    if (!personId) {
      setError('Detection must be matched first before linking to a regular')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const regular = regularsList.find(r => r.id === selectedRegularId)
      if (regular?.name) {
        await onLabelAsRegular(personId, regular.name, regular.notes || undefined)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link to regular')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateNewRegular = async () => {
    if (!regularName.trim()) {
      setError('Name is required')
      return
    }
    if (!personId) {
      setError('Detection must be matched first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onLabelAsRegular(personId, regularName.trim(), regularNotes.trim() || undefined)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create regular customer')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !detection) return null

  // Format staff name for display (safe for null/non-string)
  const formatStaffName = (name: string | null | undefined) => {
    if (!name || typeof name !== 'string') return ''
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Label Detection</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Detection Preview */}
          <div className="mb-4 flex gap-4">
            {/* Captured Image */}
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0">
              {imageData ? (
                <img
                  src={imageData}
                  alt="Detected person"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  <UserIcon size={48} />
                </div>
              )}
            </div>

            {/* Detection Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-400">Camera</p>
              <p className="text-white font-medium mb-2">{cameraId}</p>

              <p className="text-sm text-gray-400">Detection Confidence</p>
              <p className="text-white font-medium mb-2">{Math.round(detection.score * 100)}%</p>

              {detection.subLabel && (
                <>
                  <p className="text-sm text-gray-400">Current Label</p>
                  <p className="text-blue-400 font-medium">
                    {formatStaffName(detection.subLabel)}
                    {detection.subLabelScore && ` (${Math.round(detection.subLabelScore * 100)}%)`}
                  </p>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Mode Selection */}
          {mode === 'select' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400 mb-3">How would you like to label this person?</p>

              <button
                onClick={() => setMode('existing')}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white">
                  <UserIcon size={20} />
                </div>
                <div>
                  <p className="text-white font-medium">This is a staff member</p>
                  <p className="text-sm text-gray-400">Select from existing staff or create new</p>
                </div>
              </button>

              <button
                onClick={handleLabelAsCustomer}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white">
                  <UsersIcon size={20} />
                </div>
                <div>
                  <p className="text-white font-medium">This is a customer</p>
                  <p className="text-sm text-gray-400">Track anonymously (no face storage)</p>
                </div>
              </button>

              <button
                onClick={() => setMode('regular')}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white">
                  <StarIcon size={20} />
                </div>
                <div>
                  <p className="text-white font-medium">This is a regular customer</p>
                  <p className="text-sm text-gray-400">Named customer that we recognize</p>
                </div>
              </button>

              <button
                onClick={handleIgnore}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 text-gray-400">
                  <EyeIcon size={20} />
                </div>
                <div>
                  <p className="text-white font-medium">Ignore</p>
                  <p className="text-sm text-gray-400">Skip this detection</p>
                </div>
              </button>
            </div>
          )}

          {/* Existing Staff Selection */}
          {mode === 'existing' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('select')}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                &larr; Back
              </button>

              {/* Search */}
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Staff List */}
              <div className="max-h-48 overflow-y-auto space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <LoaderIcon size={24} />
                  </div>
                ) : filteredStaff.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No staff found</p>
                ) : (
                  filteredStaff.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() => setSelectedStaffId(staff.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                        selectedStaffId === staff.id
                          ? 'bg-blue-600 ring-2 ring-blue-400'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {staff.photo_path ? (
                          <img
                            src={`/api/staff/${staff.id}/photo`}
                            alt={staff.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon size={16} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{staff.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{staff.role}</p>
                      </div>
                      {staff.face_trained && (
                        <div className="flex-shrink-0 text-green-400" title="Face trained">
                          <CheckIcon size={16} />
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Create New Option */}
              <button
                onClick={() => setMode('new')}
                className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors border-2 border-dashed border-gray-600"
              >
                <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white">
                  <UserPlusIcon size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">Create New Staff</p>
                </div>
              </button>

              {/* Add Photo Checkbox */}
              {selectedStaffId && imageData && (
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={addPhotoToExisting}
                    onChange={(e) => setAddPhotoToExisting(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  Add this photo as training image
                </label>
              )}

              {/* Confirm Button */}
              {selectedStaffId && (
                <button
                  onClick={handleSelectExistingStaff}
                  disabled={saving}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <LoaderIcon size={18} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckIcon size={18} />
                      Confirm as {staffList.find(s => s.id === selectedStaffId)?.name}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* New Staff Creation */}
          {mode === 'new' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('existing')}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                &larr; Back
              </button>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter staff member name"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Face Training Note */}
              {imageData && (
                <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <p className="text-sm text-blue-200">
                    The captured face image will be used to train face recognition for this staff member.
                  </p>
                </div>
              )}

              {/* Create Button */}
              <button
                onClick={handleCreateNewStaff}
                disabled={saving || !newName.trim()}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <LoaderIcon size={18} />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlusIcon size={18} />
                    Create & Train Face
                  </>
                )}
              </button>
            </div>
          )}

          {/* Regular Customer Selection */}
          {mode === 'regular' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('select')}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                &larr; Back
              </button>

              {/* Search */}
              <input
                type="text"
                placeholder="Search regulars..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              {/* Regulars List */}
              <div className="max-h-48 overflow-y-auto space-y-2">
                {filteredRegulars.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No regulars found</p>
                ) : (
                  filteredRegulars.map((regular) => (
                    <button
                      key={regular.id}
                      onClick={() => setSelectedRegularId(regular.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                        selectedRegularId === regular.id
                          ? 'bg-amber-600 ring-2 ring-amber-400'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 text-amber-400">
                        <StarIcon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{regular.name || regular.display_id}</p>
                        <p className="text-xs text-gray-400">
                          {regular.visit_count} visits
                          {regular.notes && ` - ${regular.notes.slice(0, 30)}...`}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Create New Option */}
              <button
                onClick={() => setMode('regular-new')}
                className="w-full flex items-center gap-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors border-2 border-dashed border-gray-600"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white">
                  <UserPlusIcon size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">Create New Regular</p>
                </div>
              </button>

              {/* Confirm Button */}
              {selectedRegularId && (
                <button
                  onClick={handleSelectExistingRegular}
                  disabled={saving}
                  className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <LoaderIcon size={18} />
                      Linking...
                    </>
                  ) : (
                    <>
                      <CheckIcon size={18} />
                      Link to {regularsList.find(r => r.id === selectedRegularId)?.name}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* New Regular Creation */}
          {mode === 'regular-new' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('regular')}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                &larr; Back
              </button>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={regularName}
                  onChange={(e) => setRegularName(e.target.value)}
                  placeholder="Enter customer name (e.g., Mike)"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={regularNotes}
                  onChange={(e) => setRegularNotes(e.target.value)}
                  placeholder="E.g., 'Prefers table by window', 'Allergic to nuts'"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[80px]"
                />
              </div>

              {/* Info Note */}
              <div className="p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
                <p className="text-sm text-amber-200">
                  This person will be recognized by their appearance. Their name will appear on the camera feed when detected.
                </p>
              </div>

              {/* Create Button */}
              <button
                onClick={handleCreateNewRegular}
                disabled={saving || !regularName.trim()}
                className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <LoaderIcon size={18} />
                    Creating...
                  </>
                ) : (
                  <>
                    <StarIcon size={18} />
                    Create Regular Customer
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
