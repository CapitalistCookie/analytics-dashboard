import { useState, useRef, useCallback } from 'react'

interface PhotoUploadProps {
  currentPhotoUrl?: string | null
  onUpload: (file: File) => Promise<void>
  onTrain?: () => Promise<void>
  uploadProgress?: number
  isTraining?: boolean
  faceTrained?: boolean
  disabled?: boolean
}

export default function PhotoUpload({
  currentPhotoUrl,
  onUpload,
  onTrain,
  uploadProgress,
  isTraining,
  faceTrained,
  disabled
}: PhotoUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB')
      return false
    }
    setError(null)
    return true
  }

  const handleFile = useCallback(async (file: File) => {
    if (!validateFile(file)) return

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string)
    }
    reader.readAsDataURL(file)

    // Upload
    try {
      await onUpload(file)
    } catch (err) {
      setError('Upload failed. Please try again.')
      setPreviewUrl(null)
    }
  }, [onUpload])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return

    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click()
  }

  const displayUrl = previewUrl || currentPhotoUrl

  return (
    <div className="space-y-3">
      {/* Drop zone / Preview */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative w-full h-48 border-2 border-dashed rounded-lg
          flex items-center justify-center cursor-pointer transition-colors
          ${isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {displayUrl ? (
          <div className="relative w-full h-full">
            <img
              src={displayUrl}
              alt="Staff photo"
              className="w-full h-full object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
              <span className="text-white text-sm">Click or drop to change</span>
            </div>
          </div>
        ) : (
          <div className="text-center p-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="mt-2 text-sm text-gray-400">
              Drag & drop a photo, or click to select
            </p>
            <p className="mt-1 text-xs text-gray-500">
              PNG, JPG up to 10MB
            </p>
          </div>
        )}

        {/* Progress overlay */}
        {uploadProgress !== undefined && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-white">{uploadProgress}%</p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Training status and button */}
      {onTrain && displayUrl && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {faceTrained ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-sm text-green-400">Face trained</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="text-sm text-yellow-400">Not trained</span>
              </>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTrain()
            }}
            disabled={isTraining || disabled}
            className={`
              px-3 py-1.5 text-sm rounded-lg transition-colors
              ${isTraining
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
              }
            `}
          >
            {isTraining ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Training...
              </span>
            ) : faceTrained ? 'Retrain Face' : 'Train Face'}
          </button>
        </div>
      )}
    </div>
  )
}
