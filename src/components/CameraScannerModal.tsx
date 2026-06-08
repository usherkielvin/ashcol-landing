import { useEffect, useRef, useState } from 'react'
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react'

interface CameraScannerModalProps {
  onClose: () => void
  onCapture: (file: File) => void
  isDark: boolean
}

export default function CameraScannerModal({ onClose, onCapture, isDark }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false)

  // Request camera permissions and list cameras
  useEffect(() => {
    let activeStream: MediaStream | null = null

    async function initCamera() {
      try {
        // Request permissions first by fetching stream (facingMode: environment defaults to back camera on phones)
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        setPermissionGranted(true)
        activeStream = initialStream
        setStream(initialStream)

        if (videoRef.current) {
          videoRef.current.srcObject = initialStream
        }

        // List video input devices
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput')
        setDevices(videoDevices)

        // Try to identify the active track's device ID
        const activeTrack = initialStream.getVideoTracks()[0]
        const settings = activeTrack?.getSettings()
        const currentDeviceId = settings?.deviceId || ''
        
        if (currentDeviceId) {
          setActiveDeviceId(currentDeviceId)
        } else if (videoDevices.length > 0) {
          setActiveDeviceId(videoDevices[0].deviceId)
        }
      } catch (err: any) {
        console.error('Error initializing camera:', err)
        setError(err?.message || 'Failed to access camera. Please check permissions.')
      }
    }
    
    void initCamera()

    return () => {
      // Clean up media tracks when component unmounts
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Handle camera switch
  const handleSwitchCamera = async () => {
    if (devices.length < 2 || !activeDeviceId) return

    const currentIndex = devices.findIndex(d => d.deviceId === activeDeviceId)
    const nextIndex = (currentIndex + 1) % devices.length
    const nextDevice = devices[nextIndex]

    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } }
      })
      
      setActiveDeviceId(nextDevice.deviceId)
      if (videoRef.current) {
        videoRef.current.srcObject = newStream
      }
      setStream(newStream)
    } catch (err: any) {
      console.error('Error switching camera:', err)
      setError('Could not switch to selected camera.')
    }
  }

  const handleCapture = () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    
    // Use the video's actual resolution
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to blob and call onCapture
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `receipt-camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
        
        // Stop the tracks immediately on capture
        if (stream) {
          stream.getTracks().forEach(track => track.stop())
        }
        onClose()
      }
    }, 'image/jpeg', 0.95)
  }

  const bg = isDark ? '#0A1120' : '#ffffff'
  const border = isDark ? '#1E2D48' : '#e2e8f0'
  const text = isDark ? '#E2E8F0' : '#0f172a'
  const muted = isDark ? '#7A95B8' : '#64748b'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in"
        style={{ backgroundColor: bg, border: `1px solid ${border}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="font-black text-sm md:text-base" style={{ color: text }}>Camera Scan</h3>
              <p className="text-[10px] md:text-xs" style={{ color: muted }}>Align the receipt inside the frame and snap a picture</p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (stream) {
                stream.getTracks().forEach(track => track.stop())
              }
              onClose()
            }} 
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 text-rose-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder area */}
        <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-rose-500">
              <AlertCircle className="w-10 h-10" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : !permissionGranted ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-xs font-semibold">Requesting camera permissions...</p>
            </div>
          ) : null}

          {permissionGranted && !error && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {/* Receipt Frame Overlay Guide */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                <div className="w-full h-full border-2 border-dashed border-emerald-500/60 rounded-xl relative">
                  {/* Corner brackets */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid ${border}` }}>
          {devices.length > 1 ? (
            <button
              onClick={handleSwitchCamera}
              className="p-3 rounded-xl transition-all duration-200"
              style={{ backgroundColor: isDark ? '#1E2D48' : '#f1f5f9', color: text }}
              title="Switch Camera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-11" /> // Spacer
          )}

          <button
            onClick={handleCapture}
            disabled={!permissionGranted || !!error}
            className="w-16 h-16 rounded-full border-4 border-emerald-500 flex items-center justify-center p-1 bg-white shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="w-full h-full rounded-full bg-emerald-500 flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </button>

          <button
            onClick={() => {
              if (stream) {
                stream.getTracks().forEach(track => track.stop())
              }
              onClose()
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold border transition-all"
            style={{ borderColor: border, color: muted, backgroundColor: 'transparent' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
