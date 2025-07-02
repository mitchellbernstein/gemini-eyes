'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  VideoCameraIcon, 
  StopIcon, 
  ArrowLeftIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface Props {
  onVideoRecorded: (blob: Blob) => void
  onBack: () => void
  activityName: string
}

export default function VideoRecorder({ onVideoRecorded, onBack, activityName }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [facingMode])

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      })
      
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setError(null)
    } catch (err) {
      console.error('Camera access failed:', err)
      setError('Camera access denied. Please allow camera permissions and try again.')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const startRecording = useCallback(() => {
    if (!stream) return

    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      })
      
      chunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        onVideoRecorded(blob)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setTimeRemaining(30)

      // Start countdown timer
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopRecording()
            return 0
          }
          return prev - 1
        })
      }, 1000)

    } catch (err) {
      console.error('Recording failed:', err)
      setError('Recording failed. Please try again.')
    }
  }, [stream, onVideoRecorded])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  const toggleCamera = () => {
    setFacingMode(facingMode === 'user' ? 'environment' : 'user')
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Camera Error</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <div className="flex space-x-3">
            <button
              onClick={onBack}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={startCamera}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Overlay */}
      <div className="absolute inset-0 video-overlay">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center justify-between text-white">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>
            
            <div className="text-center">
              <h1 className="font-semibold">{activityName}</h1>
              {isRecording && (
                <div className="flex items-center justify-center space-x-1 mt-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full recording-indicator"></div>
                  <span className="text-sm font-mono">{timeRemaining}s</span>
                </div>
              )}
            </div>

            <button
              onClick={toggleCamera}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <ArrowPathIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Recording Instructions */}
        {!isRecording && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-1/2 left-4 right-4 -translate-y-1/2"
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 text-white text-center">
              <h2 className="text-lg font-semibold mb-2">Ready to Record</h2>
              <p className="text-sm text-gray-200 mb-4">
                Position yourself in frame and tap the record button. 
                You have 30 seconds to demonstrate your {activityName.toLowerCase()}.
              </p>
              <div className="flex items-center justify-center space-x-4 text-xs">
                <div className="flex items-center">
                  <span className="text-green-400 mr-1">✓</span>
                  Good lighting
                </div>
                <div className="flex items-center">
                  <span className="text-green-400 mr-1">✓</span>
                  Full body visible
                </div>
                <div className="flex items-center">
                  <span className="text-green-400 mr-1">✓</span>
                  Stable position
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Recording Progress */}
        {isRecording && (
          <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2">
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 text-white text-center">
              <div className="text-2xl font-bold mb-2">{timeRemaining}</div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div 
                  className="bg-red-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${((30 - timeRemaining) / 30) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
          <div className="flex items-center justify-center">
            {!isRecording ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={startRecording}
                className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
              >
                <VideoCameraIcon className="w-8 h-8 text-white" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={stopRecording}
                className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
              >
                <StopIcon className="w-8 h-8 text-white" />
              </motion.button>
            )}
          </div>
          
          <p className="text-white text-center text-sm mt-4 opacity-80">
            {isRecording ? 'Tap to stop recording' : 'Tap to start recording (30s max)'}
          </p>
        </div>
      </div>
    </div>
  )
} 