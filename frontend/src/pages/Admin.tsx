import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  resetAdminUserPassword,
  getRoles,
  getAuditLogs,
  getAuditLogStats,
  AdminUser,
  UserCreate,
  UserUpdate,
  RoleInfo,
  AuditLog,
  AuditLogStats
} from '../api/client'

type Tab = 'users' | 'audit'

export default function Admin() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [resetPasswordUserId, setResetPasswordUserId] = useState<number | null>(null)

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditStats, setAuditStats] = useState<AuditLogStats | null>(null)
  const [auditPage, setAuditPage] = useState(0)
  const [auditFilter, setAuditFilter] = useState({ action: '', resource_type: '' })

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    display_name: '',
    password: '',
    role: 'viewer'
  })
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') {
      setError('Access denied. Admin role required.')
      setLoading(false)
      return
    }
    loadData()
  }, [user])

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs()
      loadAuditStats()
    }
  }, [activeTab, auditPage, auditFilter])

  const loadData = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        getAdminUsers(),
        getRoles()
      ])
      setUsers(usersRes.data)
      setRoles(rolesRes.data.roles)
    } catch (err) {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadAuditLogs = async () => {
    try {
      const params: any = { skip: auditPage * 50, limit: 50 }
      if (auditFilter.action) params.action = auditFilter.action
      if (auditFilter.resource_type) params.resource_type = auditFilter.resource_type
      const { data } = await getAuditLogs(params)
      setAuditLogs(data)
    } catch (err) {
      console.error('Failed to load audit logs', err)
    }
  }

  const loadAuditStats = async () => {
    try {
      const { data } = await getAuditLogStats()
      setAuditStats(data)
    } catch (err) {
      console.error('Failed to load audit stats', err)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    try {
      const data: UserCreate = {
        username: formData.username,
        password: formData.password,
        email: formData.email || undefined,
        display_name: formData.display_name || undefined,
        role: formData.role
      }
      await createAdminUser(data)
      setSuccess('User created successfully')
      setShowUserModal(false)
      resetForm()
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create user')
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setError(null)
    setSuccess(null)

    try {
      const data: UserUpdate = {
        email: formData.email || undefined,
        display_name: formData.display_name || undefined,
        role: formData.role,
        is_active: editingUser.is_active
      }
      await updateAdminUser(editingUser.id, data)
      setSuccess('User updated successfully')
      setShowUserModal(false)
      setEditingUser(null)
      resetForm()
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      await deleteAdminUser(userId)
      setSuccess('User deleted successfully')
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete user')
    }
  }

  const handleToggleActive = async (u: AdminUser) => {
    try {
      await updateAdminUser(u.id, { is_active: !u.is_active })
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update user')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPasswordUserId || !newPassword) return

    try {
      await resetAdminUserPassword(resetPasswordUserId, newPassword)
      setSuccess('Password reset successfully')
      setShowPasswordModal(false)
      setResetPasswordUserId(null)
      setNewPassword('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset password')
    }
  }

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      display_name: '',
      password: '',
      role: 'viewer'
    })
  }

  const openEditModal = (u: AdminUser) => {
    setEditingUser(u)
    setFormData({
      username: u.username,
      email: u.email || '',
      display_name: u.display_name || '',
      password: '',
      role: u.role
    })
    setShowUserModal(true)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-900/50 text-red-300 border border-red-700'
      case 'manager': return 'bg-blue-900/50 text-blue-300 border border-blue-700'
      default: return 'bg-gray-700 text-gray-300 border border-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
        Access denied. Admin role required.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Administration</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Audit Log
          </button>
        </nav>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Users</h2>
            <button
              onClick={() => {
                resetForm()
                setEditingUser(null)
                setShowUserModal(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add User
            </button>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Login</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mr-3">
                          <span className="text-sm text-white font-medium">
                            {u.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-white">{u.display_name || u.username}</div>
                          <div className="text-sm text-gray-400">{u.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full capitalize ${getRoleBadgeColor(u.role)}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        u.is_active
                          ? 'bg-green-900/50 text-green-300 border border-green-700'
                          : 'bg-gray-700 text-gray-400 border border-gray-600'
                      }`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setResetPasswordUserId(u.id)
                          setShowPasswordModal(true)
                        }}
                        className="text-yellow-400 hover:text-yellow-300"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className="text-gray-400 hover:text-gray-300"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Role Info */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Role Permissions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div key={role.name} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                  <h4 className="font-medium text-white capitalize">{role.display_name}</h4>
                  <p className="text-sm text-gray-400 mb-2">{role.description}</p>
                  <div className="text-xs text-gray-500">
                    Permissions: {role.permissions.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Stats */}
          {auditStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-sm text-gray-400">Total Entries</p>
                <p className="text-2xl font-bold text-white">{auditStats.total}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-sm text-gray-400">Today</p>
                <p className="text-2xl font-bold text-white">{auditStats.today}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-sm text-gray-400">This Week</p>
                <p className="text-2xl font-bold text-white">{auditStats.this_week}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-sm text-gray-400">Top Action</p>
                <p className="text-2xl font-bold text-white capitalize">
                  {Object.entries(auditStats.by_action).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
                </p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4">
            <select
              value={auditFilter.action}
              onChange={(e) => setAuditFilter({ ...auditFilter, action: e.target.value })}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="export">Export</option>
            </select>
            <select
              value={auditFilter.resource_type}
              onChange={(e) => setAuditFilter({ ...auditFilter, resource_type: e.target.value })}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Resources</option>
              <option value="user">User</option>
              <option value="profile">Profile</option>
              <option value="settings">Settings</option>
              <option value="report">Report</option>
              <option value="staff">Staff</option>
              <option value="alert">Alert</option>
            </select>
          </div>

          {/* Log Table */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Resource</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {log.username || 'System'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded capitalize ${
                        log.action === 'delete' ? 'bg-red-900/50 text-red-300 border border-red-700' :
                        log.action === 'create' ? 'bg-green-900/50 text-green-300 border border-green-700' :
                        'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 capitalize">
                      {log.resource_type} {log.resource_id ? `#${log.resource_id}` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate">
                      {log.details || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setAuditPage(Math.max(0, auditPage - 1))}
              disabled={auditPage === 0}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">Page {auditPage + 1}</span>
            <button
              onClick={() => setAuditPage(auditPage + 1)}
              disabled={auditLogs.length < 50}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingUser ? 'Edit User' : 'Create User'}
            </h2>
            <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserModal(false)
                    setEditingUser(null)
                    resetForm()
                  }}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Reset Password</h2>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false)
                    setResetPasswordUserId(null)
                    setNewPassword('')
                  }}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
