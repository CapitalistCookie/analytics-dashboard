import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getProfile,
  updateProfile,
  updateNotificationPreferences,
  uploadProfilePhoto,
  deleteProfilePhoto,
  changeProfilePassword,
  Profile as ProfileType,
  NotificationPreferences
} from '../api/client'

export default function Profile() {
  const { refreshUser } = useAuth()
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form states
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Notification preferences
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [notifyInApp, setNotifyInApp] = useState(true)
  const [notifyAlerts, setNotifyAlerts] = useState(true)
  const [notifyReports, setNotifyReports] = useState(true)

  // Photo upload
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data } = await getProfile()
      setProfile(data)
      setDisplayName(data.display_name || '')
      setEmail(data.email || '')
      setNotifyEmail(data.notify_email)
      setNotifyInApp(data.notify_in_app)
      setNotifyAlerts(data.notify_alerts)
      setNotifyReports(data.notify_reports)
    } catch (err) {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const { data } = await updateProfile({ display_name: displayName, email })
      setProfile(data)
      setSuccess('Profile updated successfully')
      refreshUser()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await changeProfilePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password changed successfully')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateNotifications = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const prefs: NotificationPreferences = {
        notify_email: notifyEmail,
        notify_in_app: notifyInApp,
        notify_alerts: notifyAlerts,
        notify_reports: notifyReports
      }
      const { data } = await updateNotificationPreferences(prefs)
      setProfile(data)
      setSuccess('Notification preferences updated')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update notifications')
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      await uploadProfilePhoto(file, (progress) => setUploadProgress(progress))
      await loadProfile()
      setSuccess('Photo uploaded successfully')
      refreshUser()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload photo')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDeletePhoto = async () => {
    if (!confirm('Are you sure you want to delete your profile photo?')) return

    try {
      await deleteProfilePhoto()
      await loadProfile()
      setSuccess('Photo deleted')
      refreshUser()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete photo')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Account Information</h2>

          {/* Photo */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="relative">
              {profile?.photo_path ? (
                <img
                  src={`/api/profile/photo-file`}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-2xl text-gray-500">
                    {profile?.username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {uploading ? `Uploading ${uploadProgress}%` : 'Upload Photo'}
              </button>
              {profile?.photo_path && (
                <button
                  onClick={handleDeletePhoto}
                  className="block text-sm text-red-500 hover:text-red-700"
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={profile?.username || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <input
                type="text"
                value={profile?.role || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 capitalize"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Member Since
              </label>
              <input
                type="text"
                value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Password Change */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Notification Preferences */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Notification Preferences</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-gray-500">Receive notifications via email</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={notifyInApp}
                onChange={(e) => setNotifyInApp(e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <div>
                <p className="font-medium">In-App Notifications</p>
                <p className="text-sm text-gray-500">Show notifications in the dashboard</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={notifyAlerts}
                onChange={(e) => setNotifyAlerts(e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <div>
                <p className="font-medium">Alert Notifications</p>
                <p className="text-sm text-gray-500">Get notified about system alerts</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 p-3 border rounded hover:bg-gray-50">
              <input
                type="checkbox"
                checked={notifyReports}
                onChange={(e) => setNotifyReports(e.target.checked)}
                className="h-4 w-4 text-blue-500"
              />
              <div>
                <p className="font-medium">Report Notifications</p>
                <p className="text-sm text-gray-500">Get notified when reports are ready</p>
              </div>
            </label>
          </div>

          <button
            onClick={handleUpdateNotifications}
            disabled={saving}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Notification Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
