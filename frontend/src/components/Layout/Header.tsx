import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLayout } from './Layout'

export default function Header() {
  const [time, setTime] = useState(new Date())
  const { setMobileMenuOpen, isMobile } = useLayout()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Get page title from current route
  const getPageTitle = () => {
    const path = location.pathname
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/analytics': 'Analytics',
      '/search': 'Search',
      '/cameras': 'Cameras',
      '/staff': 'Staff',
      '/alerts': 'Alerts',
      '/zones': 'Zones',
      '/profile': 'Profile',
      '/admin': 'Admin',
      '/settings': 'Settings',
      '/reports': 'Reports'
    }
    return titles[path] || 'Dashboard'
  }

  const enterKioskMode = () => {
    navigate('/kiosk')
  }

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-4 md:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Hamburger menu button - mobile only */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-white">{getPageTitle()}</h2>
            <p className="text-xs md:text-sm text-gray-400 hidden sm:block">{formatDate(time)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          {/* Kiosk mode button */}
          <button
            onClick={enterKioskMode}
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white text-sm transition-colors"
            title="Enter Kiosk Mode"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="hidden lg:inline">Kiosk</span>
          </button>

          {/* Time display */}
          <div className="text-right">
            <p className="text-lg md:text-3xl font-mono text-white">{formatTime(time)}</p>
          </div>

          {/* Status indicator */}
          <div className="hidden md:flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm text-gray-300">System Online</span>
          </div>

          {/* Mobile status dot only */}
          {isMobile && (
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse md:hidden"></span>
          )}
        </div>
      </div>
    </header>
  )
}
