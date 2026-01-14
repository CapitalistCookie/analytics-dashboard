import { useState, ReactNode } from 'react'

interface CollapsibleCardProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
  headerClassName?: string
  /** Badge to show next to title (e.g., count) */
  badge?: string | number
  /** Whether to show on mobile only */
  mobileCollapsible?: boolean
}

/**
 * Collapsible card component for mobile-friendly layouts.
 * Expands/collapses content with smooth animation.
 * Can be configured to only be collapsible on mobile.
 */
export default function CollapsibleCard({
  title,
  icon,
  children,
  defaultExpanded = true,
  className = '',
  headerClassName = '',
  badge,
  mobileCollapsible = false,
}: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // If mobileCollapsible is true, only allow collapse on mobile
  const handleToggle = () => {
    if (mobileCollapsible && typeof window !== 'undefined' && window.innerWidth >= 768) {
      return // Don't toggle on desktop
    }
    setExpanded(!expanded)
  }

  const isCollapsible = !mobileCollapsible || (typeof window !== 'undefined' && window.innerWidth < 768)

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between p-3 md:p-4 ${
          isCollapsible ? 'cursor-pointer tap-target' : ''
        } ${headerClassName}`}
        onClick={handleToggle}
        role={isCollapsible ? 'button' : undefined}
        aria-expanded={isCollapsible ? expanded : undefined}
      >
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm md:text-base">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          {title}
          {badge !== undefined && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-700 rounded-full text-gray-400">
              {badge}
            </span>
          )}
        </h3>
        {isCollapsible && (
          <button
            className="text-gray-400 hover:text-white transition-colors p-1 -m-1 tap-target flex items-center justify-center"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Content with animation */}
      <div
        className={`collapsible-content ${expanded ? 'expanded' : 'collapsed'}`}
      >
        <div className="px-3 pb-3 md:px-4 md:pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}
