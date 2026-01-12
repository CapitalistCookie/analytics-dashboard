import { useState, useEffect, useCallback } from 'react'
import {
  searchEvents,
  getSearchCameras,
  getSearchLabels,
  getSearchSuggestions,
  SearchResult,
  SearchCamera,
  SearchLabel,
  SearchParams
} from '../api/client'

const FRIGATE_URL = '/frigate'

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [cameras, setCameras] = useState<SearchCamera[]>([])
  const [labels, setLabels] = useState<SearchLabel[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])

  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [selectedLabel, setSelectedLabel] = useState<string>('person')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(0.5)

  // Pagination
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const limit = 20

  // Selected result for detail view
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [camerasRes, labelsRes, suggestionsRes] = await Promise.all([
          getSearchCameras(),
          getSearchLabels(),
          getSearchSuggestions()
        ])
        setCameras(camerasRes.data.cameras)
        setLabels(labelsRes.data.labels)
        setSuggestions(suggestionsRes.data.suggestions)
      } catch (err) {
        console.error('Failed to load filters:', err)
      }
    }
    loadFilters()
  }, [])

  // Search function
  const performSearch = useCallback(async (newPage = 1) => {
    setLoading(true)
    setError(null)

    const params: SearchParams = {
      page: newPage,
      limit,
      label: selectedLabel || undefined,
      min_score: minScore
    }

    if (query.trim()) params.query = query.trim()
    if (selectedCamera) params.camera = selectedCamera
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate

    try {
      const response = await searchEvents(params)
      setResults(response.data.results)
      setTotal(response.data.total)
      setHasMore(response.data.has_more)
      setPage(newPage)
    } catch (err) {
      setError('Failed to search events')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [query, selectedCamera, selectedLabel, startDate, endDate, minScore])

  // Initial search on mount
  useEffect(() => {
    performSearch()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(1)
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    performSearch(1)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const getSeverityColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (score >= 0.6) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Search Events</h1>
        <p className="text-gray-400 mt-1">Search detection events using semantic search</p>
      </div>

      {/* Search Form */}
      <div className="bg-gray-800 rounded-lg p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Search Query
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., person entering, person at counter..."
                className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Suggestions:</span>
              {suggestions.slice(0, 6).map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded-full hover:bg-gray-600"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-gray-700">
            {/* Camera Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Camera
              </label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Cameras</option>
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>{cam.name}</option>
                ))}
              </select>
            </div>

            {/* Label Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Object Type
              </label>
              <select
                value={selectedLabel}
                onChange={(e) => setSelectedLabel(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>{label.name}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Min Score */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Min Score: {minScore.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-gray-400">
          {total > 0 ? `Found ${total} results` : 'No results found'}
        </p>
        {total > 0 && (
          <p className="text-gray-500 text-sm">
            Page {page} of {Math.ceil(total / limit)}
          </p>
        )}
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {results.map((result) => (
          <div
            key={result.id}
            onClick={() => setSelectedResult(result)}
            className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
          >
            {/* Thumbnail */}
            <div className="aspect-video bg-gray-700 relative">
              <img
                src={`${FRIGATE_URL}/api/events/${result.id}/thumbnail.jpg`}
                alt={`Event ${result.id}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23374151" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239CA3AF">No Image</text></svg>'
                }}
              />
              {/* Badges */}
              <div className="absolute top-2 left-2 flex gap-1">
                {result.has_snapshot && (
                  <span className="px-2 py-0.5 text-xs bg-blue-500/80 text-white rounded">
                    Snapshot
                  </span>
                )}
                {result.has_clip && (
                  <span className="px-2 py-0.5 text-xs bg-green-500/80 text-white rounded">
                    Clip
                  </span>
                )}
              </div>
              {/* Score badge */}
              <div className="absolute top-2 right-2">
                <span className={`px-2 py-0.5 text-xs rounded border ${getSeverityColor(result.score)}`}>
                  {(result.score * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-white capitalize">
                  {result.label}
                </span>
                <span className="text-xs text-gray-500">
                  {result.camera}
                </span>
              </div>
              <p className="text-sm text-gray-400">
                {formatTime(result.start_time)}
              </p>
              {result.sub_label && (
                <p className="text-xs text-blue-400 mt-1">
                  {result.sub_label}
                </p>
              )}
              {result.description && (
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {result.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => performSearch(page - 1)}
            disabled={page === 1 || loading}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-400">
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => performSearch(page + 1)}
            disabled={!hasMore || loading}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedResult && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Event Details</h2>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Large Image */}
              <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden mb-4">
                {selectedResult.has_snapshot ? (
                  <img
                    src={`${FRIGATE_URL}/api/events/${selectedResult.id}/snapshot.jpg`}
                    alt={`Event ${selectedResult.id}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={`${FRIGATE_URL}/api/events/${selectedResult.id}/thumbnail.jpg`}
                    alt={`Event ${selectedResult.id}`}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Camera</p>
                  <p className="font-medium text-white">{selectedResult.camera}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Label</p>
                  <p className="font-medium text-white capitalize">{selectedResult.label}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Score</p>
                  <p className="font-medium text-white">{(selectedResult.score * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Start Time</p>
                  <p className="font-medium text-white">{formatTime(selectedResult.start_time)}</p>
                </div>
                {selectedResult.end_time && (
                  <div>
                    <p className="text-sm text-gray-500">End Time</p>
                    <p className="font-medium text-white">{formatTime(selectedResult.end_time)}</p>
                  </div>
                )}
                {selectedResult.sub_label && (
                  <div>
                    <p className="text-sm text-gray-500">Sub Label</p>
                    <p className="font-medium text-white">{selectedResult.sub_label}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Event ID</p>
                  <p className="font-mono text-xs text-gray-400">{selectedResult.id}</p>
                </div>
              </div>

              {selectedResult.description && (
                <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Description</p>
                  <p className="text-gray-300">{selectedResult.description}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                {selectedResult.has_clip && (
                  <a
                    href={`${FRIGATE_URL}/api/events/${selectedResult.id}/clip.mp4`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    View Clip
                  </a>
                )}
                {selectedResult.has_snapshot && (
                  <a
                    href={`${FRIGATE_URL}/api/events/${selectedResult.id}/snapshot.jpg`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    Full Snapshot
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
