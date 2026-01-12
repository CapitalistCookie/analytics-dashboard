import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import userEvent from '@testing-library/user-event'

interface WrapperProps {
  children: ReactNode
}

// Wrapper with all providers (BrowserRouter)
const AllProviders = ({ children }: WrapperProps) => {
  return (
    <BrowserRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </BrowserRouter>
  )
}

// Wrapper with MemoryRouter for testing specific routes
interface MemoryRouterWrapperOptions {
  initialEntries?: string[]
}

const createMemoryRouterWrapper = (options: MemoryRouterWrapperOptions = {}) => {
  const { initialEntries = ['/'] } = options
  return ({ children }: WrapperProps) => (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </MemoryRouter>
  )
}

// Custom render with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllProviders, ...options })
  }
}

// Render with memory router for route testing
const renderWithRouter = (
  ui: ReactElement,
  routerOptions: MemoryRouterWrapperOptions = {},
  renderOptions?: Omit<RenderOptions, 'wrapper'>
) => {
  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: createMemoryRouterWrapper(routerOptions),
      ...renderOptions
    })
  }
}

// Render without any router (for unit testing isolated components)
const renderWithAuth = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const AuthWrapper = ({ children }: WrapperProps) => (
    <AuthProvider>{children}</AuthProvider>
  )
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AuthWrapper, ...options })
  }
}

// Helper to wait for element to be removed
const waitForElementToBeRemoved = async (callback: () => HTMLElement | null) => {
  const element = callback()
  if (element) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

// Helper to mock authenticated state
// Uses the same keys as AuthContext
const mockAuthenticatedUser = () => {
  localStorage.setItem('analytics_auth_token', 'mock_token_12345')
  localStorage.setItem('analytics_auth_user', JSON.stringify({
    id: 1,
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    is_active: true,
  }))
}

// Helper to clear auth state
const clearAuthState = () => {
  localStorage.removeItem('analytics_auth_token')
  localStorage.removeItem('analytics_auth_user')
  localStorage.clear()
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { userEvent }

// Export custom utilities
export {
  customRender as render,
  renderWithRouter,
  renderWithAuth,
  waitForElementToBeRemoved,
  mockAuthenticatedUser,
  clearAuthState,
}
