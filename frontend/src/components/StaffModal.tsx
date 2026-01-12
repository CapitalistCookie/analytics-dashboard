import { useState, useEffect } from 'react'
import PhotoUpload from './PhotoUpload'
import {
  createStaff,
  updateStaff,
  uploadStaffPhoto,
  trainStaffFace,
  type Staff,
  type StaffCreate
} from '../api/client'

interface StaffModalProps {
  isOpen: boolean
  staff?: Staff | null
  onClose: () => void
  onSave: (staff: Staff) => void
}

const ROLES = ['server', 'host', 'bartender', 'manager', 'chef', 'busser', 'kitchen']

export default function StaffModal({ isOpen, staff, onClose, onSave }: StaffModalProps) {
  const [formData, setFormData] = useState<StaffCreate>({
    name: '',
    role: 'server',
    badge_id: ''
  })
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined)
  const [isTraining, setIsTraining] = useState(false)
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null)

  const isEdit = !!staff

  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name,
        role: staff.role,
        badge_id: staff.badge_id || ''
      })
      setIsActive(staff.is_active)
      setCurrentStaff(staff)
    } else {
      setFormData({ name: '', role: 'server', badge_id: '' })
      setIsActive(true)
      setCurrentStaff(null)
    }
    setError(null)
    setUploadProgress(undefined)
  }, [staff, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      let savedStaff: Staff
      if (isEdit && staff) {
        const res = await updateStaff(staff.id, {
          name: formData.name,
          role: formData.role,
          badge_id: formData.badge_id || undefined,
          is_active: isActive
        })
        savedStaff = res.data
      } else {
        const res = await createStaff({
          name: formData.name,
          role: formData.role,
          badge_id: formData.badge_id || undefined
        })
        savedStaff = res.data
        setCurrentStaff(savedStaff)
      }
      onSave(savedStaff)
      if (!isEdit) {
        // Keep modal open for new staff to add photo
        setCurrentStaff(savedStaff)
      } else {
        onClose()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save staff member'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoUpload = async (file: File) => {
    if (!currentStaff) return

    setUploadProgress(0)
    try {
      const res = await uploadStaffPhoto(currentStaff.id, file, (progress) => {
        setUploadProgress(progress)
      })
      setCurrentStaff(res.data)
      setUploadProgress(100)
      setTimeout(() => setUploadProgress(undefined), 500)
    } catch (err) {
      setError('Photo upload failed')
      setUploadProgress(undefined)
    }
  }

  const handleTrain = async () => {
    if (!currentStaff) return

    setIsTraining(true)
    try {
      await trainStaffFace(currentStaff.id)
      setCurrentStaff({ ...currentStaff, face_trained: true })
    } catch (err) {
      setError('Face training failed')
    } finally {
      setIsTraining(false)
    }
  }

  if (!isOpen) return null

  const photoUrl = currentStaff?.photo_path
    ? `/api/staff/${currentStaff.id}/photo-file`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Photo upload - only for existing staff */}
          {currentStaff && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Photo
              </label>
              <PhotoUpload
                currentPhotoUrl={photoUrl}
                onUpload={handlePhotoUpload}
                onTrain={handleTrain}
                uploadProgress={uploadProgress}
                isTraining={isTraining}
                faceTrained={currentStaff.face_trained}
                disabled={saving}
              />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter staff name"
              disabled={saving}
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Role <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={saving}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Badge ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Badge ID
            </label>
            <input
              type="text"
              value={formData.badge_id}
              onChange={(e) => setFormData({ ...formData, badge_id: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional badge ID"
              disabled={saving}
            />
          </div>

          {/* Active status - only for edit */}
          {isEdit && (
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                  disabled={saving}
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <span className="text-sm text-gray-300">Active</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : isEdit ? 'Save Changes' : 'Create Staff'}
            </button>
          </div>

          {/* Hint for new staff */}
          {!isEdit && !currentStaff && (
            <p className="text-xs text-gray-500 text-center">
              After creating, you can add a photo and train face recognition
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
