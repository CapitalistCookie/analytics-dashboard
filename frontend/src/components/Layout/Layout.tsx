import { ReactNode, useState, createContext, useContext, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutContextType {
  isMobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  isMobile: boolean
}

const LayoutContext = createContext<LayoutContextType>({
  isMobileMenuOpen: false,
  setMobileMenuOpen: () => {},
  isMobile: false
})

export const useLayout = () => useContext(LayoutContext)

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close menu when clicking outside on mobile
  const handleOverlayClick = () => {
    if (isMobileMenuOpen) {
      setMobileMenuOpen(false)
    }
  }

  return (
    <LayoutContext.Provider value={{ isMobileMenuOpen, setMobileMenuOpen, isMobile }}>
      <div className="flex min-h-screen bg-gray-900">
        {/* Mobile overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={handleOverlayClick}
          />
        )}

        {/* Sidebar - hidden on mobile unless menu is open */}
        <div
          className={`
            fixed md:static inset-y-0 left-0 z-50
            transform transition-transform duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  )
}
