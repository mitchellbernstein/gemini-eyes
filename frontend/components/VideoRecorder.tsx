'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useOpenPanel } from '@openpanel/nextjs'
import { 
  VideoCameraIcon, 
  StopIcon, 
  ArrowLeftIcon,
  ArrowPathIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon
} from '@heroicons/react/24/outline'

// MediaPipe imports
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'

interface Props {
  onVideoRecorded: (blob: Blob) => void
  onBack: () => void
  activityName: string
}

interface PoseData {
  landmarks: any[]
  timestamp: number
}

interface CoachingCue {
  message: string
  type: 'good' | 'warning' | 'tip'
  timestamp: number
}

export default function VideoRecorder({ onVideoRecorded, onBack, activityName }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [currentCue, setCurrentCue] = useState<CoachingCue | null>(null)
  const [poseDetected, setPoseDetected] = useState(false)
  const [performanceStats, setPerformanceStats] = useState({
    repCount: 0,
    formScore: 0,
    goodFrames: 0,
    totalFrames: 0
  })
  
  const op = useOpenPanel()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const poseRef = useRef<Pose | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const lastCueRef = useRef<number>(0)
  const poseDataRef = useRef<PoseData[]>([])

  // Text-to-Speech function
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.1
    utterance.pitch = 1.0
    utterance.volume = 0.8
    window.speechSynthesis.speak(utterance)
  }, [voiceEnabled])

  // Activity-specific pose analysis
  const analyzePose = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length === 0) {
      setPoseDetected(false)
      return
    }

    setPoseDetected(true)
    const currentTime = Date.now()
    
    // Store pose data for later analysis
    poseDataRef.current.push({
      landmarks: landmarks,
      timestamp: currentTime
    })

    // Update performance stats
    setPerformanceStats(prev => ({
      ...prev,
      totalFrames: prev.totalFrames + 1
    }))

    // Activity-specific analysis
    let cue: CoachingCue | null = null
    const now = Date.now()
    
    // Only give cues every 3 seconds to avoid spam
    if (now - lastCueRef.current < 3000) return

    switch (activityName.toLowerCase()) {
      case 'basketball shooting':
        cue = analyzeBasketballForm(landmarks)
        break
      case 'squat form':
        cue = analyzeSquatForm(landmarks)
        break
      case 'push-ups':
        cue = analyzePushupForm(landmarks)
        break
      case 'tennis serve':
        cue = analyzeTennisForm(landmarks)
        break
      default:
        cue = analyzeGeneralForm(landmarks)
    }

    if (cue) {
      setCurrentCue(cue)
      speak(cue.message)
      lastCueRef.current = now
      
      if (cue.type === 'good') {
        setPerformanceStats(prev => ({
          ...prev,
          goodFrames: prev.goodFrames + 1,
          formScore: Math.round(((prev.goodFrames + 1) / (prev.totalFrames + 1)) * 100)
        }))
      }

      // Clear cue after 3 seconds
      setTimeout(() => setCurrentCue(null), 3000)
    }
  }, [activityName, speak])

  // Basketball shooting analysis
  const analyzeBasketballForm = (landmarks: any[]): CoachingCue | null => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12] 
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]

    // Check shooting elbow alignment (right-handed shooter)
    const shoulderElbowDiff = Math.abs(rightShoulder.y - rightElbow.y)
    const elbowWristDiff = Math.abs(rightElbow.y - rightWrist.y)
    
    if (rightWrist.y < rightElbow.y && rightElbow.y < rightShoulder.y) {
      if (Math.abs(rightShoulder.x - rightElbow.x) < 0.1) {
        return {
          message: "Perfect elbow alignment! Keep that form.",
          type: 'good',
          timestamp: Date.now()
        }
      }
    }
    
    if (Math.abs(rightShoulder.x - rightElbow.x) > 0.15) {
      return {
        message: "Bring your elbow under the ball",
        type: 'warning', 
        timestamp: Date.now()
      }
    }

    return {
      message: "Follow through with your wrist",
      type: 'tip',
      timestamp: Date.now()
    }
  }

  // Squat form analysis  
  const analyzeSquatForm = (landmarks: any[]): CoachingCue | null => {
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const leftKnee = landmarks[25] 
    const rightKnee = landmarks[26]
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]

    // Check if knees are tracking over toes
    const kneeAnkleAlignment = Math.abs(leftKnee.x - leftAnkle.x) + Math.abs(rightKnee.x - rightAnkle.x)
    
    if (kneeAnkleAlignment < 0.1) {
      return {
        message: "Great knee tracking! Keep your core tight.",
        type: 'good',
        timestamp: Date.now()
      }
    }

    // Check squat depth
    const hipKneeDiff = (leftHip.y + rightHip.y) / 2 - (leftKnee.y + rightKnee.y) / 2
    
    if (hipKneeDiff < 0.05) {
      return {
        message: "Go deeper! Hips below knees.",
        type: 'warning',
        timestamp: Date.now()
      }
    }

    return {
      message: "Keep your chest up and core engaged",
      type: 'tip', 
      timestamp: Date.now()
    }
  }

  // Push-up form analysis
  const analyzePushupForm = (landmarks: any[]): CoachingCue | null => {
    const nose = landmarks[0]
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13] 
    const rightElbow = landmarks[14]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]

    // Check plank alignment (straight line from head to hips)
    const shoulderHipAlignment = Math.abs(
      ((leftShoulder.y + rightShoulder.y) / 2) - 
      ((leftHip.y + rightHip.y) / 2)
    )
    
    if (shoulderHipAlignment < 0.1) {
      return {
        message: "Perfect plank position! Nice form.",
        type: 'good',
        timestamp: Date.now()
      }
    }

    if (((leftHip.y + rightHip.y) / 2) > ((leftShoulder.y + rightShoulder.y) / 2) + 0.15) {
      return {
        message: "Keep your hips level with your shoulders",
        type: 'warning',
        timestamp: Date.now()
      }
    }

    return {
      message: "Maintain a straight line from head to toe",
      type: 'tip',
      timestamp: Date.now()
    }
  }

  // Tennis serve analysis
  const analyzeTennisForm = (landmarks: any[]): CoachingCue | null => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const rightElbow = landmarks[14]
    const rightWrist = landmarks[16]

    // Check service motion - arm extension
    const armExtension = Math.abs(rightShoulder.y - rightWrist.y)
    
    if (rightWrist.y < rightShoulder.y - 0.2) {
      return {
        message: "Great reach! Full extension on serve.",
        type: 'good',
        timestamp: Date.now()
      }
    }

    return {
      message: "Reach up high for maximum power",
      type: 'tip',
      timestamp: Date.now()
    }
  }

  // General form analysis
  const analyzeGeneralForm = (landmarks: any[]): CoachingCue | null => {
    return {
      message: "Good posture! Keep it up.",
      type: 'good', 
      timestamp: Date.now()
    }
  }

  // Initialize MediaPipe Pose
  useEffect(() => {
    const initializePose = async () => {
      const pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        }
      })

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: true,
        smoothSegmentation: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })

      pose.onResults((results) => {
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height)

          if (results.poseLandmarks) {
            // Draw pose connections
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: '#00FF00',
              lineWidth: 4
            })
            
            // Draw landmarks
            drawLandmarks(ctx, results.poseLandmarks, {
              color: '#FF0000',
              lineWidth: 2,
              radius: 6
            })

            // Analyze pose for coaching
            analyzePose(results.poseLandmarks)
          }
        }
      })

      poseRef.current = pose
    }

    initializePose()

    return () => {
      if (poseRef.current) {
        poseRef.current.close()
      }
    }
  }, [analyzePose])

  useEffect(() => {
    startCamera()
    
    // Track video recorder loaded
    if (op) {
      op.track('video_recorder_loaded', {
        activityName: activityName,
        facingMode: facingMode,
        voiceEnabled: voiceEnabled
      })
    }
    
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
        
        // Initialize MediaPipe camera when video is ready
        videoRef.current.onloadedmetadata = () => {
          if (poseRef.current && videoRef.current) {
            const camera = new Camera(videoRef.current, {
              onFrame: async () => {
                if (poseRef.current && videoRef.current) {
                  await poseRef.current.send({ image: videoRef.current })
                }
              },
              width: 1280,
              height: 720
            })
            cameraRef.current = camera
            camera.start()
          }
        }
      }
      setError(null)
      
      // Track camera access success
      if (op) {
        op.track('camera_access_granted', {
          facingMode: facingMode,
          activityName: activityName
        })
      }
    } catch (err) {
      console.error('Camera access failed:', err)
      setError('Camera access denied. Please allow camera permissions and try again.')
      
      // Track camera access failure
      if (op) {
        op.track('camera_access_denied', {
          error: String(err),
          facingMode: facingMode,
          activityName: activityName
        })
      }
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    if (cameraRef.current) {
      cameraRef.current.stop()
    }
  }

  const startRecording = useCallback(() => {
    if (!stream) return

    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      })
      
      chunksRef.current = []
      poseDataRef.current = []
      
      // Reset performance stats
      setPerformanceStats({
        repCount: 0,
        formScore: 0,
        goodFrames: 0,
        totalFrames: 0
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        
        // Track recording completed with pose data
        if (op) {
          op.track('recording_completed', {
            activityName: activityName,
            duration: 30 - timeRemaining,
            videoSize: blob.size,
            facingMode: facingMode,
            poseFrames: poseDataRef.current.length,
            formScore: performanceStats.formScore,
            voiceEnabled: voiceEnabled
          })
        }
        
        speak("Recording complete! Processing your analysis...")
        onVideoRecorded(blob)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setTimeRemaining(30)

      // Track recording started
      if (op) {
        op.track('recording_started', {
          activityName: activityName,
          facingMode: facingMode,
          voiceEnabled: voiceEnabled
        })
      }

      // Welcome message
      speak(`Recording started! Show me your ${activityName.toLowerCase()}. You've got 30 seconds!`)

      // Start countdown timer
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopRecording()
            return 0
          }
          
          // Voice countdown for last 5 seconds
          if (prev <= 5 && voiceEnabled) {
            speak(prev.toString())
          }
          
          return prev - 1
        })
      }, 1000)

    } catch (err) {
      console.error('Recording failed:', err)
      setError('Recording failed. Please try again.')
      
      // Track recording error
      if (op) {
        op.track('recording_error', {
          error: String(err),
          activityName: activityName
        })
      }
    }
  }, [stream, onVideoRecorded, timeRemaining, op, activityName, facingMode, performanceStats.formScore, voiceEnabled, speak])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      
      // Track manual recording stop
      if (op) {
        op.track('recording_stopped_manually', {
          activityName: activityName,
          timeRemaining: timeRemaining,
          formScore: performanceStats.formScore
        })
      }
    }
  }, [isRecording, op, activityName, timeRemaining, performanceStats.formScore])

  const toggleCamera = () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)
    
    // Track camera toggle
    if (op) {
      op.track('camera_toggled', {
        fromMode: facingMode,
        toMode: newFacingMode,
        activityName: activityName
      })
    }
  }

  const toggleVoice = () => {
    const newVoiceEnabled = !voiceEnabled
    setVoiceEnabled(newVoiceEnabled)
    
    if (newVoiceEnabled) {
      speak("Voice coaching enabled")
    }
    
    // Track voice toggle
    if (op) {
      op.track('voice_toggled', {
        enabled: newVoiceEnabled,
        activityName: activityName
      })
    }
  }

  const handleBack = () => {
    // Track back navigation
    if (op) {
      op.track('video_recorder_back', {
        activityName: activityName,
        wasRecording: isRecording
      })
    }
    
    onBack()
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
              onClick={handleBack}
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

      {/* Pose Detection Canvas Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: 5 }}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 video-overlay" style={{ zIndex: 10 }}>
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center justify-between text-white">
            <button
              onClick={handleBack}
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
              {poseDetected && (
                <div className="flex items-center justify-center space-x-1 mt-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs">Pose Detected</span>
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={toggleVoice}
                className={`p-2 rounded-full transition-colors ${
                  voiceEnabled ? 'bg-green-600/80' : 'bg-white/20'
                } hover:bg-white/30`}
              >
                {voiceEnabled ? (
                  <SpeakerWaveIcon className="w-6 h-6" />
                ) : (
                  <SpeakerXMarkIcon className="w-6 h-6" />
                )}
              </button>
              <button
                onClick={toggleCamera}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <ArrowPathIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Performance Stats */}
        {isRecording && performanceStats.totalFrames > 0 && (
          <div className="absolute top-20 right-4">
            <div className="bg-black/60 backdrop-blur-sm rounded-lg p-3 text-white text-sm">
              <div className="text-center">
                <div className="text-lg font-bold text-green-400">
                  {performanceStats.formScore}%
                </div>
                <div className="text-xs opacity-80">Form Score</div>
              </div>
            </div>
          </div>
        )}

        {/* Live Coaching Cue */}
        {currentCue && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/3 left-4 right-4"
          >
            <div className={`rounded-xl p-4 text-white text-center backdrop-blur-sm ${
              currentCue.type === 'good' ? 'bg-green-600/80' :
              currentCue.type === 'warning' ? 'bg-red-600/80' :
              'bg-blue-600/80'
            }`}>
              <div className="font-semibold">{currentCue.message}</div>
            </div>
          </motion.div>
        )}

        {/* Recording Instructions */}
        {!isRecording && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-1/2 left-4 right-4 -translate-y-1/2"
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-4 text-white text-center">
              <h2 className="text-lg font-semibold mb-2">Ready for Real-Time Coaching</h2>
              <p className="text-sm text-gray-200 mb-4">
                Position yourself in frame and tap record. You'll get live feedback during your {activityName.toLowerCase()}.
              </p>
              <div className="flex items-center justify-center space-x-4 text-xs mb-3">
                <div className="flex items-center">
                  <span className="text-green-400 mr-1">✓</span>
                  Good lighting
                </div>
                <div className="flex items-center">
                  <span className="text-green-400 mr-1">✓</span>
                  Full body visible
                </div>
                <div className="flex items-center">
                  <span className={`mr-1 ${poseDetected ? 'text-green-400' : 'text-yellow-400'}`}>
                    {poseDetected ? '✓' : '⏳'}
                  </span>
                  Pose detected
                </div>
              </div>
              <div className="text-xs text-blue-200">
                💡 {voiceEnabled ? 'Voice coaching enabled' : 'Tap speaker icon for voice coaching'}
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
            {isRecording ? 'Tap to stop recording' : 'Tap to start recording with live coaching (30s max)'}
          </p>
        </div>
      </div>
    </div>
  )
} 