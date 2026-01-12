import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, login as apiLogin, register as apiRegister, checkAuth, getCurrentUser, setAuthToken } from '../api/client'

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'analytics_auth_token'
const USER_KEY = 'analytics_auth_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check for existing token on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(TOKEN_KEY)
      const storedUser = localStorage.getItem(USER_KEY)

      if (token && storedUser) {
        setAuthToken(token)
        try {
          // Verify token is still valid
          const response = await checkAuth()
          if (response.data.authenticated) {
            setUser(JSON.parse(storedUser))
          } else {
            // Token expired
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
            setAuthToken(null)
          }
        } catch {
          // Token invalid
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setAuthToken(null)
        }
      }
      setIsLoading(false)
    }

    initAuth()
  }, [])

  const login = async (username: string, password: string) => {
    setError(null)
    setIsLoading(true)
    try {
      const response = await apiLogin(username, password)
      const { access_token, user: userData } = response.data

      // Store token and user
      localStorage.setItem(TOKEN_KEY, access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
      setAuthToken(access_token)
      setUser(userData)
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Login failed'
        : 'Login failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (username: string, password: string, email?: string) => {
    setError(null)
    setIsLoading(true)
    try {
      await apiRegister(username, password, email)
      // Auto-login after registration
      await login(username, password)
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Registration failed'
        : 'Registration failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setAuthToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    try {
      const response = await getCurrentUser()
      const userData = response.data
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
      setUser(userData)
    } catch {
      // Ignore errors
    }
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        error,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
