import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getCameraNames, updateCameraName, resetCameraName, type CameraName } from '../api/client'

interface CameraContextType {
  cameraNames: Record<string, CameraName>
  getDisplayName: (cameraId: string) => string
  isCustomName: (cameraId: string) => boolean
  renameCameraFn: (cameraId: string, newName: string) => Promise<void>
  resetCameraNameFn: (cameraId: string) => Promise<void>
  loading: boolean
  refreshNames: () => Promise<void>
}

const CameraContext = createContext<CameraContextType | undefined>(undefined)

export function CameraProvider({ children }: { children: ReactNode }) {
  const [cameraNames, setCameraNames] = useState<Record<string, CameraName>>({})
  const [loading, setLoading] = useState(true)

  const refreshNames = useCallback(async () => {
    try {
      const response = await getCameraNames()
      const nameMap: Record<string, CameraName> = {}
      for (const cam of response.data) {
        nameMap[cam.camera_id] = cam
      }
      setCameraNames(nameMap)
    } catch (error) {
      console.error('Failed to fetch camera names:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshNames()
  }, [refreshNames])

  const getDisplayName = useCallback((cameraId: string): string => {
    const cam = cameraNames[cameraId]
    return cam?.display_name || cameraId
  }, [cameraNames])

  const isCustomName = useCallback((cameraId: string): boolean => {
    return cameraNames[cameraId]?.is_custom || false
  }, [cameraNames])

  const renameCameraFn = useCallback(async (cameraId: string, newName: string) => {
    try {
      const response = await updateCameraName(cameraId, newName)
      setCameraNames(prev => ({
        ...prev,
        [cameraId]: response.data
      }))
    } catch (error) {
      console.error('Failed to rename camera:', error)
      throw error
    }
  }, [])

  const resetCameraNameFn = useCallback(async (cameraId: string) => {
    try {
      const response = await resetCameraName(cameraId)
      setCameraNames(prev => ({
        ...prev,
        [cameraId]: response.data
      }))
    } catch (error) {
      console.error('Failed to reset camera name:', error)
      throw error
    }
  }, [])

  return (
    <CameraContext.Provider value={{
      cameraNames,
      getDisplayName,
      isCustomName,
      renameCameraFn,
      resetCameraNameFn,
      loading,
      refreshNames
    }}>
      {children}
    </CameraContext.Provider>
  )
}

export function useCamera() {
  const context = useContext(CameraContext)
  if (context === undefined) {
    throw new Error('useCamera must be used within a CameraProvider')
  }
  return context
}
