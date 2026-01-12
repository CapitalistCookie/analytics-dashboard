import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getShiftNotes,
  getCurrentShiftNotes,
  createShiftNote,
  updateShiftNote,
  deleteShiftNote,
  toggleNotePin,
  acknowledgeNote,
  acknowledgeAllNotes,
  getNoteStats,
  getNoteCategories,
  getNoteTemplates,
  getUnreadNoteCount,
  type ShiftNote,
  type NoteCreate,
  type NoteUpdate,
  type NoteStats,
  type NoteCategory,
  type NoteTemplate
} from '../api/client'

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  maintenance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  customer: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  inventory: 'bg-green-500/20 text-green-400 border-green-500/30',
  staff: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  safety: 'bg-red-500/20 text-red-400 border-red-500/30'
}

const CATEGORY_ICONS: Record<string, string> = {
  general: '📝',
  maintenance: '🔧',
  customer: '👤',
  inventory: '📦',
  staff: '👥',
  safety: '⚠️'
}

export default function Notes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<ShiftNote[]>([])
  const [currentShiftNotes, setCurrentShiftNotes] = useState<ShiftNote[]>([])
  const [stats, setStats] = useState<NoteStats | null>(null)
  const [categories, setCategories] = useState<Record<string, NoteCategory>>({})
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // View state
  const [activeTab, setActiveTab] = useState<'current' | 'all'>('current')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [showAcknowledged, setShowAcknowledged] = useState(true)

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [editingNote, setEditingNote] = useState<ShiftNote | null>(null)

  // Form state
  const [formData, setFormData] = useState<NoteCreate>({
    content: '',
    category: 'general',
    is_pinned: false
  })

  useEffect(() => {
    loadData()
  }, [categoryFilter, showAcknowledged])

  const loadData = async () => {
    try {
      setLoading(true)
      const [currentRes, allRes, statsRes, catsRes, templatesRes, unreadRes] = await Promise.all([
        getCurrentShiftNotes(!showAcknowledged),
        getShiftNotes({
          category: categoryFilter || undefined,
          is_acknowledged: showAcknowledged ? undefined : false,
          days: 7
        }),
        getNoteStats(7),
        getNoteCategories(),
        getNoteTemplates(),
        getUnreadNoteCount()
      ])
      setCurrentShiftNotes(currentRes.data)
      setNotes(allRes.data)
      setStats(statsRes.data)
      setCategories(catsRes.data.categories)
      setTemplates(templatesRes.data.templates)
      setUnreadCount(unreadRes.data.unread_count)
      setError(null)
    } catch (err) {
      setError('Failed to load notes')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNote = async () => {
    if (!user) return
    try {
      await createShiftNote(formData, user.id)
      setShowCreateModal(false)
      setFormData({ content: '', category: 'general', is_pinned: false })
      loadData()
    } catch (err) {
      console.error('Failed to create note:', err)
    }
  }

  const handleUpdateNote = async (id: number, data: NoteUpdate) => {
    try {
      await updateShiftNote(id, data)
      loadData()
      setEditingNote(null)
    } catch (err) {
      console.error('Failed to update note:', err)
    }
  }

  const handleDeleteNote = async (id: number) => {
    if (!confirm('Are you sure you want to delete this note?')) return
    try {
      await deleteShiftNote(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete note:', err)
    }
  }

  const handleTogglePin = async (id: number) => {
    try {
      await toggleNotePin(id)
      loadData()
    } catch (err) {
      console.error('Failed to toggle pin:', err)
    }
  }

  const handleAcknowledge = async (id: number) => {
    if (!user) return
    try {
      await acknowledgeNote(id, user.id)
      loadData()
    } catch (err) {
      console.error('Failed to acknowledge note:', err)
    }
  }

  const handleAcknowledgeAll = async () => {
    if (!user) return
    try {
      await acknowledgeAllNotes(user.id, categoryFilter || undefined)
      loadData()
    } catch (err) {
      console.error('Failed to acknowledge all notes:', err)
    }
  }

  const handleUseTemplate = (template: NoteTemplate) => {
    setFormData({
      ...formData,
      content: template.content,
      category: template.category
    })
    setShowTemplatesModal(false)
    setShowCreateModal(true)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  const displayedNotes = activeTab === 'current' ? currentShiftNotes : notes

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shift Notes</h1>
          <p className="text-gray-400">Leave notes for the next shift</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
            >
              Mark All Read ({unreadCount})
            </button>
          )}
          <button
            onClick={() => setShowTemplatesModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
          >
            Templates
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            Add Note
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Notes</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Unread</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.unread}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Pinned</p>
            <p className="text-2xl font-bold text-blue-400">{stats.pinned}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">This Week</p>
            <p className="text-2xl font-bold text-green-400">{stats.total}</p>
          </div>
        </div>
      )}

      {/* Tabs and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 rounded-lg text-sm ${
              activeTab === 'current'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Current Shift
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-sm ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All Notes
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 text-sm"
          >
            <option value="">All Categories</option>
            {Object.entries(categories).map(([key, cat]) => (
              <option key={key} value={key}>{cat.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={(e) => setShowAcknowledged(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            Show read notes
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        /* Notes List */
        <div className="space-y-3">
          {displayedNotes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No notes found
            </div>
          ) : (
            displayedNotes.map((note) => (
              <div
                key={note.id}
                className={`bg-gray-800 rounded-lg border p-4 transition-colors ${
                  note.is_pinned
                    ? 'border-yellow-500/50 bg-yellow-900/10'
                    : note.is_acknowledged
                    ? 'border-gray-700'
                    : 'border-blue-500/50 bg-blue-900/10'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl">{CATEGORY_ICONS[note.category] || '📝'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {note.is_pinned && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            📌 Pinned
                          </span>
                        )}
                        {!note.is_acknowledged && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            New
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${CATEGORY_COLORS[note.category]}`}>
                          {categories[note.category]?.name || note.category}
                        </span>
                        {note.shift_type && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
                            {note.shift_type}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-300 whitespace-pre-wrap">{note.content}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span>By {note.created_by_name || 'Unknown'}</span>
                        <span>{formatDate(note.created_at)}</span>
                        {note.is_acknowledged && note.acknowledged_by_name && (
                          <span className="text-green-500">
                            ✓ Read by {note.acknowledged_by_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleTogglePin(note.id)}
                      className={`p-2 rounded ${
                        note.is_pinned
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title={note.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      📌
                    </button>
                    {!note.is_acknowledged && (
                      <button
                        onClick={() => handleAcknowledge(note.id)}
                        className="p-2 bg-green-600 hover:bg-green-700 text-white rounded"
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      onClick={() => setEditingNote(note)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Note Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Add Shift Note</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Category</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(categories).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setFormData({ ...formData, category: key })}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        formData.category === key
                          ? CATEGORY_COLORS[key]
                          : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                      }`}
                    >
                      {CATEGORY_ICONS[key]} {cat.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Note *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  rows={5}
                  placeholder="Enter your note for the next shift..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={formData.is_pinned}
                  onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                Pin this note (important)
              </label>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setFormData({ content: '', category: 'general', is_pinned: false })
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNote}
                disabled={!formData.content.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Edit Note</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Category</label>
                <select
                  value={editingNote.category}
                  onChange={(e) => setEditingNote({ ...editingNote, category: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  {Object.entries(categories).map(([key, cat]) => (
                    <option key={key} value={key}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Note</label>
                <textarea
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  rows={5}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={editingNote.is_pinned}
                  onChange={(e) => setEditingNote({ ...editingNote, is_pinned: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                Pin this note
              </label>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setEditingNote(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateNote(editingNote.id, {
                  content: editingNote.content,
                  category: editingNote.category,
                  is_pinned: editingNote.is_pinned
                })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700 sticky top-0 bg-gray-800">
              <h2 className="text-lg font-semibold text-white">Quick Templates</h2>
              <p className="text-sm text-gray-400">Select a template to start with</p>
            </div>
            <div className="p-4 space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleUseTemplate(template)}
                  className="w-full text-left p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg border border-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{CATEGORY_ICONS[template.category]}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${CATEGORY_COLORS[template.category]}`}>
                      {categories[template.category]?.name || template.category}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm">{template.content}</p>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-gray-700 sticky bottom-0 bg-gray-800">
              <button
                onClick={() => setShowTemplatesModal(false)}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
