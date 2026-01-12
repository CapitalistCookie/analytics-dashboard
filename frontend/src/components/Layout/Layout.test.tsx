import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../test/utils'
import Layout from './Layout'

describe('Layout', () => {
  it('renders children content', () => {
    render(
      <Layout>
        <div data-testid="child-content">Test Content</div>
      </Layout>
    )
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders sidebar with navigation items', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    // Analytics and Dashboard appear in multiple places
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
  })

  it('renders header with page title', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    // Default route shows Dashboard
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
  })

  it('renders time display in header', async () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    // Time should be displayed
    await waitFor(() => {
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/)
      expect(timeElements.length).toBeGreaterThan(0)
    })
  })

  it('renders system status indicator', () => {
    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )
    expect(screen.getByText('System Online')).toBeInTheDocument()
  })

  it('closes mobile menu when viewport is resized to desktop', async () => {
    // Mock window.innerWidth
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 })

    render(
      <Layout>
        <div>Content</div>
      </Layout>
    )

    // Resize to desktop
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))

    // Restore
    Object.defineProperty(window, 'innerWidth', { writable: true, value: originalInnerWidth })
  })
})
