/**
 * PersonDetailModal - Shows detailed information about a tracked person
 *
 * Features:
 * - View/edit name, notes, type
 * - View all sightings with timestamps
 * - View all embeddings with ability to delete/verify
 * - Merge with another person
 * - View and create negative pairs
 */

import { useState, useEffect } from 'react'
import {
  getPersonDetail,
  updatePerson,
  deleteEmbedding,
  verifyEmbedding,
  mergePersons,
  createNegativePair,
  getTrackedPersons,
  type PersonDetail,
  type TrackedPerson,
  type PersonUpdate,
} from '../api/client'

// Icons
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

const EditIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
)

const TrashIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
)

const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

const MergeIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6L12 2L16 6"></path>
    <path d="M12 2V15"></path>
    <path d="M5 15L12 22L19 15"></path>
  </svg>
)

const LoaderIcon = ({ size = 16 }: { size?: number }) => (
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

interface PersonDetailModalProps {
  isOpen: boolean
  personId: number | null
  onClose: () => void
  onUpdated?: () => void
}

type Tab = 'info' | 'sightings' | 'embeddings' | 'merge'

export default function PersonDetailModal({
  isOpen,
  personId,
  onClose,
  onUpdated,
}: PersonDetailModalProps) {
  const [person, setPerson] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [isEditing, setIsEditing] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editType, setEditType] = useState('visitor')

  // Merge state
  const [otherPersons, setOtherPersons] = useState<TrackedPerson[]>([])
  const [selectedMergeId, setSelectedMergeId] = useState<number | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')

  // Load person details
  useEffect(() => {
    if (isOpen && personId) {
      loadPerson()
      loadOtherPersons()
    }
    // Reset state when closed
    if (!isOpen) {
      setPerson(null)
      setActiveTab('info')
      setIsEditing(false)
      setError(null)
    }
  }, [isOpen, personId])

  const loadPerson = async () => {
    if (!personId) return
    setLoading(true)
    setError(null)
    try {
      const res = await getPersonDetail(personId)
      setPerson(res.data)
      // Initialize edit form
      setEditName(res.data.name || '')
      setEditNotes(res.data.notes || '')
      setEditType(res.data.person_type || 'visitor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person')
    } finally {
      setLoading(false)
    }
  }

  const loadOtherPersons = async () => {
    try {
      const res = await getTrackedPersons(false, 100)
      setOtherPersons(res.data.persons.filter(p => p.id !== personId))
    } catch (err) {
      console.error('Failed to load persons for merge:', err)
    }
  }

  const handleSave = async () => {
    if (!personId) return
    setSaving(true)
    setError(null)
    try {
      const update: PersonUpdate = {
        name: editName || undefined,
        notes: editNotes || undefined,
        person_type: editType,
        is_regular: editType === 'regular',
      }
      await updatePerson(personId, update)
      await loadPerson()
      setIsEditing(false)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEmbedding = async (embeddingId: number) => {
    if (!personId || !confirm('Delete this embedding?')) return
    try {
      await deleteEmbedding(personId, embeddingId)
      await loadPerson()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete embedding')
    }
  }

  const handleVerifyEmbedding = async (embeddingId: number) => {
    if (!personId) return
    try {
      await verifyEmbedding(personId, embeddingId)
      await loadPerson()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify embedding')
    }
  }

  const handleMerge = async () => {
    if (!personId || !selectedMergeId) return
    if (!confirm(`Merge ${otherPersons.find(p => p.id === selectedMergeId)?.display_id} into ${person?.display_id}? This cannot be undone.`)) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await mergePersons({ keep_id: personId, merge_id: selectedMergeId })
      await loadPerson()
      await loadOtherPersons()
      setSelectedMergeId(null)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge persons')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkNotSame = async () => {
    if (!personId || !selectedMergeId) return
    setSaving(true)
    setError(null)
    try {
      await createNegativePair({
        person_id_a: personId,
        person_id_b: selectedMergeId,
        reason: 'Manual correction'
      })
      setSelectedMergeId(null)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create negative pair')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (isoString: string) => {
    const utcString = isoString.endsWith('Z') ? isoString : isoString + 'Z'
    const date = new Date(utcString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredMergePersons = otherPersons.filter(p =>
    p.display_id.toLowerCase().includes(mergeSearch.toLowerCase()) ||
    p.name?.toLowerCase().includes(mergeSearch.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">
              {person?.name || `Person ${person?.display_id}`}
            </h2>
            {person && (
              <span className={`px-2 py-0.5 text-xs rounded ${
                person.is_staff
                  ? 'bg-blue-500/20 text-blue-400'
                  : person.is_regular
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-gray-600 text-gray-300'
              }`}>
                {person.is_staff ? 'Staff' : person.is_regular ? 'Regular' : 'Visitor'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {(['info', 'sightings', 'embeddings', 'merge'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderIcon size={32} />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
              {error}
            </div>
          ) : person ? (
            <>
              {/* Info Tab */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  {isEditing ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Enter name (optional)"
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                          <option value="visitor">Visitor</option>
                          <option value="regular">Regular Customer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Add notes..."
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white min-h-[80px]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                        >
                          {saving ? <LoaderIcon size={18} /> : <CheckIcon size={18} />}
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-400">Display ID</p>
                          <p className="text-white font-medium">{person.display_id}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Name</p>
                          <p className="text-white font-medium">{person.name || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">First Seen</p>
                          <p className="text-white font-medium">{formatTime(person.first_seen)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Last Seen</p>
                          <p className="text-white font-medium">{formatTime(person.last_seen)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Visit Count</p>
                          <p className="text-white font-medium">{person.visit_count}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Embeddings</p>
                          <p className="text-white font-medium">{person.embeddings.length}</p>
                        </div>
                      </div>
                      {person.notes && (
                        <div className="mt-4">
                          <p className="text-sm text-gray-400">Notes</p>
                          <p className="text-white bg-gray-700/50 rounded p-2 mt-1">{person.notes}</p>
                        </div>
                      )}
                      <button
                        onClick={() => setIsEditing(true)}
                        className="mt-4 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2"
                      >
                        <EditIcon size={16} /> Edit Details
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Sightings Tab */}
              {activeTab === 'sightings' && (
                <div className="space-y-2">
                  {person.sightings.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">No sightings recorded</p>
                  ) : (
                    person.sightings.map((sighting) => (
                      <div key={sighting.id} className="p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium">{sighting.camera_id}</span>
                          <span className="text-gray-400 text-sm">{formatTime(sighting.enter_time)}</span>
                        </div>
                        {sighting.zone_name && (
                          <span className="text-sm text-gray-400">{sighting.zone_name}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Embeddings Tab */}
              {activeTab === 'embeddings' && (
                <div className="space-y-2">
                  {person.embeddings.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">No embeddings</p>
                  ) : (
                    person.embeddings.map((emb) => (
                      <div key={emb.id} className="p-3 bg-gray-700/50 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{emb.camera_id || 'Unknown'}</span>
                            {emb.is_verified && (
                              <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">Verified</span>
                            )}
                          </div>
                          <span className="text-sm text-gray-400">
                            Confidence: {Math.round(emb.confidence * 100)}% | {formatTime(emb.created_at)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!emb.is_verified && (
                            <button
                              onClick={() => handleVerifyEmbedding(emb.id)}
                              className="p-2 text-green-400 hover:bg-green-500/20 rounded"
                              title="Mark as verified"
                            >
                              <CheckIcon size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteEmbedding(emb.id)}
                            className="p-2 text-red-400 hover:bg-red-500/20 rounded"
                            title="Delete embedding"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Merge Tab */}
              {activeTab === 'merge' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Merge another person into this one, or mark two persons as NOT the same.
                  </p>
                  <input
                    type="text"
                    placeholder="Search persons..."
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {filteredMergePersons.slice(0, 20).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedMergeId(p.id)}
                        className={`w-full p-2 rounded-lg text-left transition-colors ${
                          selectedMergeId === p.id
                            ? 'bg-purple-600 ring-2 ring-purple-400'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        <span className="text-white font-medium">{p.name || p.display_id}</span>
                        {p.name && <span className="text-gray-400 ml-2">({p.display_id})</span>}
                      </button>
                    ))}
                  </div>
                  {selectedMergeId && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleMerge}
                        disabled={saving}
                        className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        {saving ? <LoaderIcon size={18} /> : <MergeIcon size={18} />}
                        Merge Into This Person
                      </button>
                      <button
                        onClick={handleMarkNotSame}
                        disabled={saving}
                        className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg font-medium"
                      >
                        Not Same Person
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-400 text-center py-8">Select a person to view details</p>
          )}
        </div>
      </div>
    </div>
  )
}
