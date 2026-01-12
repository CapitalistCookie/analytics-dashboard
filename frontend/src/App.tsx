import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StreamQualityProvider } from './context/StreamQualityContext'
import { CameraProvider } from './context/CameraContext'
import { WebRTCConnectionManagerProvider } from './context/WebRTCConnectionManager'
import Layout from './components/Layout/Layout'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Cameras from './pages/Cameras'
import Staff from './pages/Staff'
import Zones from './pages/Zones'
import Search from './pages/Search'
import Alerts from './pages/Alerts'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import Kiosk from './pages/Kiosk'
import Shifts from './pages/Shifts'
import Scorecards from './pages/Scorecards'
import Incidents from './pages/Incidents'
import Notes from './pages/Notes'
import Activity from './pages/Activity'
import DetectionSettings from './pages/DetectionSettings'

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth()
  const [searchParams] = useSearchParams()

  // Check for kiosk mode via URL param
  const isKioskMode = searchParams.get('kiosk') === 'true'

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Kiosk mode - still requires auth but shows full screen
  if (isKioskMode && isAuthenticated) {
    return <Kiosk />
  }

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/kiosk" element={
        <ProtectedRoute>
          <Kiosk />
        </ProtectedRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/search" element={<Search />} />
              <Route path="/cameras" element={<Cameras />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/zones" element={<Zones />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/shifts" element={<Shifts />} />
              <Route path="/scorecards" element={<Scorecards />} />
              <Route path="/scorecards/:staffId" element={<Scorecards />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/detection" element={<DetectionSettings />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <StreamQualityProvider>
        <CameraProvider>
          <WebRTCConnectionManagerProvider>
            <AppRoutes />
          </WebRTCConnectionManagerProvider>
        </CameraProvider>
      </StreamQualityProvider>
    </AuthProvider>
  )
}
