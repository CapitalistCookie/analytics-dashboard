import { useState, useEffect, useCallback } from 'react'
import {
  getStaff,
  deleteStaff,
  trainStaffFace,
  type Staff as StaffType
} from '../api/client'
import StaffModal from '../components/StaffModal'

export default function Staff() {
  const [staff, setStaff] = useState<StaffType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffType | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<StaffType | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Training states
  const [trainingId, setTrainingId] = useState<number | null>(null)

  // Selected staff for details view
  const [selectedStaff, setSelectedStaff] = useState<StaffType | null>(null)

  const fetchStaff = useCallback(async () => {
    try {
      const res = await getStaff()
      setStaff(res.data.staff || [])
      setError(null)
    } catch (err) {
      console.error('Failed to fetch staff:', err)
      setError('Failed to load staff members')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStaff()
  }, [fetchStaff])

  const handleAddClick = () => {
    setEditingStaff(null)
    setIsModalOpen(true)
  }

  const handleEditClick = (member: StaffType) => {
    setEditingStaff(member)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (member: StaffType) => {
    setDeleteTarget(member)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      await deleteStaff(deleteTarget.id)
      setStaff((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (selectedStaff?.id === deleteTarget.id) {
        setSelectedStaff(null)
      }
    } catch (err) {
      console.error('Delete failed:', err)
      setError('Failed to delete staff member')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleModalSave = (savedStaff: StaffType) => {
    setStaff((prev) => {
      const exists = prev.find((s) => s.id === savedStaff.id)
      if (exists) {
        return prev.map((s) => (s.id === savedStaff.id ? savedStaff : s))
      }
      return [...prev, savedStaff]
    })
  }

  const handleTrain = async (member: StaffType) => {
    if (!member.photo_path) {
      setError('Upload a photo before training')
      return
    }

    setTrainingId(member.id)
    try {
      await trainStaffFace(member.id)
      setStaff((prev) =>
        prev.map((s) =>
          s.id === member.id ? { ...s, face_trained: true } : s
        )
      )
    } catch (err) {
      setError('Face training failed')
    } finally {
      setTrainingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Staff Management</h2>
          <p className="text-gray-400 text-sm mt-1">
            {staff.length} staff member{staff.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleAddClick}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Staff Member
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Staff list */}
        <div className="flex-1">
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Staff Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Face Training
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="text-gray-500">
                        <svg className="mx-auto h-12 w-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p>No staff members yet</p>
                        <button
                          onClick={handleAddClick}
                          className="mt-3 text-blue-400 hover:text-blue-300"
                        >
                          Add your first staff member
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  staff.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => setSelectedStaff(member)}
                      className={`cursor-pointer transition-colors ${
                        selectedStaff?.id === member.id
                          ? 'bg-blue-900/30'
                          : 'hover:bg-gray-700/50'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {member.photo_path ? (
                            <img
                              src={`/api/staff/${member.id}/photo-file`}
                              alt={member.name}
                              className="w-10 h-10 rounded-full object-cover bg-gray-700"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                              <span className="text-lg font-medium text-white">
                                {member.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium">{member.name}</p>
                            {member.badge_id && (
                              <p className="text-gray-500 text-xs font-mono">
                                {member.badge_id}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-gray-300 capitalize">{member.role}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {member.face_trained ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            Trained
                          </span>
                        ) : member.photo_path ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleTrain(member)
                            }}
                            disabled={trainingId === member.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-purple-900/50 text-purple-400 rounded-full hover:bg-purple-900/70 transition-colors"
                          >
                            {trainingId === member.id ? (
                              <>
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Training...
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                </svg>
                                Train
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                            No Photo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {member.is_active ? (
                          <span className="px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded-full">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditClick(member)
                          }}
                          className="text-blue-400 hover:text-blue-300 p-1"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteClick(member)
                          }}
                          className="text-red-400 hover:text-red-300 p-1 ml-1"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Staff details sidebar */}
        {selectedStaff && (
          <div className="w-80 bg-gray-800 rounded-lg p-4 h-fit">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-white">Staff Details</h3>
              <button
                onClick={() => setSelectedStaff(null)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Photo */}
            <div className="flex justify-center mb-4">
              {selectedStaff.photo_path ? (
                <img
                  src={`/api/staff/${selectedStaff.id}/photo-file`}
                  alt={selectedStaff.name}
                  className="w-32 h-32 rounded-lg object-cover bg-gray-700"
                />
              ) : (
                <div className="w-32 h-32 bg-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-4xl font-medium text-gray-400">
                    {selectedStaff.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase">Name</p>
                <p className="text-white">{selectedStaff.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Role</p>
                <p className="text-white capitalize">{selectedStaff.role}</p>
              </div>
              {selectedStaff.badge_id && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Badge ID</p>
                  <p className="text-white font-mono">{selectedStaff.badge_id}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 uppercase">Face Recognition</p>
                <p className={selectedStaff.face_trained ? 'text-green-400' : 'text-yellow-400'}>
                  {selectedStaff.face_trained ? 'Trained' : 'Not Trained'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <p className={selectedStaff.is_active ? 'text-green-400' : 'text-gray-400'}>
                  {selectedStaff.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Created</p>
                <p className="text-gray-300 text-sm">{formatDate(selectedStaff.created_at)}</p>
              </div>
            </div>

            {/* Activity log placeholder */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Recent Activity</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <p className="italic">Activity tracking coming soon</p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleEditClick(selectedStaff)}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteClick(selectedStaff)}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <StaffModal
        isOpen={isModalOpen}
        staff={editingStaff}
        onClose={() => setIsModalOpen(false)}
        onSave={handleModalSave}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-gray-800 rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Staff Member</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white">{deleteTarget.name}</span>?
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
