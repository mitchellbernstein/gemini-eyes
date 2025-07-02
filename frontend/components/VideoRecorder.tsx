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
  SpeakerXMarkIcon,
  ChatBubbleLeftRightIcon,
  PlayIcon,
  PauseIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import CoachingChatLog from './CoachingChatLog'

// MediaPipe imports
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'

interface Props {
  onVideoRecorded: (blob: Blob, coachingData: CoachingSession) => void
  onBack: () => void
  activityName: string
}

interface PoseData {
  landmarks: any[]
  timestamp: number
}

interface CoachingCue {
  message: string
  type: 'good' | 'warning' | 'tip' | 'rep_complete'
  timestamp: number
  repNumber?: number
  formScore?: number
}

interface RepData {
  number: number
  startTime: number
  endTime: number
  formScore: number
  cuesGiven: CoachingCue[]
  phases: ExercisePhase[]
}

interface ExercisePhase {
  phase: string
  startTime: number
  endTime: number
  landmarks: any[]
}

interface CoachingSession {
  activityName: string
  startTime: number
  endTime: number
  totalReps: number
  averageFormScore: number
  reps: RepData[]
  allCues: CoachingCue[]
  improvementAreas: string[]
  strengths: string[]
}

// Exercise state machine types
type JumpingJackState = 'down' | 'transitioning_up' | 'up' | 'transitioning_down'
type SquatState = 'standing' | 'descending' | 'bottom' | 'ascending'
type PushupState = 'up' | 'descending' | 'down' | 'ascending'

// Live coaching modes
type CoachingMode = 'setup' | 'live' | 'paused' | 'recording'
type CoachingState = 'waiting' | 'monitoring' | 'analyzing' | 'feedback'

interface ExerciseState {
  currentPhase: string
  repCount: number
  currentRepStartTime: number
  phaseStartTime: number
  lastTransitionTime: number
  currentRepCues: CoachingCue[]
  currentRepPhases: ExercisePhase[]
}

interface LiveCoachingState {
  mode: CoachingMode
  state: CoachingState
  sessionStartTime: number
  lastAnalysisTime: number
  repCount: number
  isWaitingForUser: boolean
  currentActivity: string
}

export default function VideoRecorder({ onVideoRecorded, onBack, activityName }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [error, setError] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    // Load saved voice preference from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice_coaching_enabled')
      return saved === 'true'
    }
    return false
  })
  const [currentCue, setCurrentCue] = useState<CoachingCue | null>(null)
  const [poseDetected, setPoseDetected] = useState(false)
  const [showChatLog, setShowChatLog] = useState(true)
  const [lastFrameAnalysis, setLastFrameAnalysis] = useState<number>(0)
  
  // Live coaching state
  const [liveCoaching, setLiveCoaching] = useState<LiveCoachingState>({
    mode: 'setup',
    state: 'waiting',
    sessionStartTime: 0,
    lastAnalysisTime: 0,
    repCount: 0,
    isWaitingForUser: true,
    currentActivity: activityName
  })
  
  // Enhanced performance stats with rep tracking
  const [performanceStats, setPerformanceStats] = useState({
    repCount: 0,
    formScore: 0,
    goodFrames: 0,
    totalFrames: 0,
    currentRepScore: 100,
    bestRepScore: 0
  })
  
  // Exercise state machine
  const [exerciseState, setExerciseState] = useState<ExerciseState>({
    currentPhase: getInitialPhase(activityName),
    repCount: 0,
    currentRepStartTime: 0,
    phaseStartTime: 0,
    lastTransitionTime: 0,
    currentRepCues: [],
    currentRepPhases: []
  })

  // Coaching session data
  const [coachingSession, setCoachingSession] = useState<CoachingSession>({
    activityName,
    startTime: 0,
    endTime: 0,
    totalReps: 0,
    averageFormScore: 0,
    reps: [],
    allCues: [],
    improvementAreas: [],
    strengths: []
  })

  // Feedback history for adaptive coaching
  const [feedbackHistory, setFeedbackHistory] = useState<string[]>([])
  const [lastFeedbackTime, setLastFeedbackTime] = useState(0)
  
  const op = useOpenPanel()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const poseRef = useRef<Pose | null>(null)
  const cameraRef = useRef<Camera | null>(null)
  const poseReadyRef = useRef(false)
  const lastCueRef = useRef<number>(0)
  const poseDataRef = useRef<PoseData[]>([])
  const analyzePoseRef = useRef<(landmarks: any[]) => void>(() => {})
  const liveCoachingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get initial phase for activity
  function getInitialPhase(activity: string): string {
    const activityLower = activity.toLowerCase()
    if (activityLower.includes('jumping jack')) return 'down'
    if (activityLower.includes('squat')) return 'standing'
    if (activityLower.includes('push')) return 'up'
    if (activityLower.includes('plank')) return 'plank'
    if (activityLower.includes('golf')) return 'ready'
    return 'ready'
  }

  // Start live coaching session
  const startLiveCoaching = useCallback(async () => {
    try {
      const token = localStorage.getItem('google_token')
      
      // Start backend session if authenticated
      if (token) {
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/live-coaching/start/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              activity_type: activityName
            })
          })

          if (!response.ok) {
            console.error('Backend session start failed:', await response.text())
          }
        } catch (error) {
          console.error('Error starting backend session:', error)
        }
      }

      setLiveCoaching(prev => ({
        ...prev,
        mode: 'live',
        state: 'waiting',
        sessionStartTime: Date.now(),
        isWaitingForUser: true
      }))

      // Initialize coaching session
      setCoachingSession(prev => ({
        ...prev,
        startTime: Date.now()
      }))

      // Start continuous analysis loop
      startContinuousAnalysis()

      // Give initial setup instruction
      const setupMessage = getSetupMessage(activityName)
      const setupCue: CoachingCue = {
        message: setupMessage,
        type: 'tip',
        timestamp: Date.now()
      }
      
      setCurrentCue(setupCue)
      await speak(setupMessage, 'setup')

      // After setup, tell user we're ready to watch
      setTimeout(() => {
        const readyMessage = "Great! I'm watching. Start your exercise when you're ready."
        const readyCue: CoachingCue = {
          message: readyMessage,
          type: 'good',
          timestamp: Date.now()
        }
        setCurrentCue(readyCue)
        speak(readyMessage, 'ready')
      }, 3000)

    } catch (error) {
      console.error('Error starting live coaching:', error)
      setError('Failed to start live coaching')
    }
  }, [activityName])

  // Stop live coaching session
  const stopLiveCoaching = useCallback(async () => {
    const token = localStorage.getItem('google_token')
    
    // Stop backend session if authenticated
    if (token) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/live-coaching/stop/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            coaching_data: {
              total_reps: liveCoaching.repCount,
              duration: Date.now() - liveCoaching.sessionStartTime,
              feedback_count: coachingSession.allCues.length
            }
          })
        })

        if (!response.ok) {
          console.error('Backend session stop failed:', await response.text())
        }
      } catch (error) {
        console.error('Error stopping backend session:', error)
      }
    }

    setLiveCoaching(prev => ({
      ...prev,
      mode: 'setup',
      state: 'waiting'
    }))

    if (liveCoachingIntervalRef.current) {
      clearInterval(liveCoachingIntervalRef.current)
      liveCoachingIntervalRef.current = null
    }

    // Final session summary
    setCoachingSession(prev => ({
      ...prev,
      endTime: Date.now()
    }))
  }, [liveCoaching.repCount, liveCoaching.sessionStartTime, coachingSession.allCues.length])

  // Pause/Resume live coaching
  const toggleLiveCoaching = useCallback(() => {
    setLiveCoaching(prev => ({
      ...prev,
      mode: prev.mode === 'paused' ? 'live' : 'paused'
    }))
  }, [])

  // Get setup message for each activity
  const getSetupMessage = (activity: string): string => {
    const activityLower = activity.toLowerCase()
    
    if (activityLower.includes('jumping jack')) {
      return "Stand with feet together, arms at your sides. I'll guide you through proper jumping jack form."
    } else if (activityLower.includes('squat')) {
      return "Stand with feet shoulder-width apart, toes slightly turned out. Keep your chest up and core engaged."
    } else if (activityLower.includes('push')) {
      return "Get into plank position with hands under shoulders, body in a straight line from head to heels."
    } else if (activityLower.includes('golf')) {
      return "Set up with your feet shoulder-width apart, ball positioned in your stance. I'll analyze your swing form."
    } else if (activityLower.includes('basketball')) {
      return "Position yourself for shooting with feet shoulder-width apart, shooting hand under the ball."
    } else {
      return `Let's work on your ${activity}. Get into starting position and I'll provide real-time feedback.`
    }
  }

  // Start continuous analysis without recording
  const startContinuousAnalysis = useCallback(() => {
    if (liveCoachingIntervalRef.current) {
      clearInterval(liveCoachingIntervalRef.current)
    }

    console.log('Starting continuous analysis interval...')

    // Analyze frames every 1000ms for continuous feedback
    liveCoachingIntervalRef.current = setInterval(() => {
      console.log('Interval tick - checking conditions:', {
        mode: liveCoaching.mode,
        poseReady: poseReadyRef.current,
        canvasExists: !!canvasRef.current,
        poseDataLength: poseDataRef.current.length,
        lastAnalysisTime: liveCoaching.lastAnalysisTime
      })

      // Check conditions more flexibly - don't rely on exact mode timing
      if ((liveCoaching.mode === 'live' || liveCoaching.mode === 'setup') && 
          poseReadyRef.current && 
          canvasRef.current && 
          poseDataRef.current.length > 0) {
        
        const currentTime = Date.now()
        
        // Only analyze if enough time has passed since last analysis
        if (currentTime - liveCoaching.lastAnalysisTime >= 1000) {
          console.log('Calling analyzeLiveFrame...')
          analyzeLiveFrame(currentTime)
        } else {
          console.log('Skipping analysis - too soon since last analysis')
        }
      } else {
        console.log('Conditions not met for analysis')
      }
    }, 1000)
  }, [])

  // Analyze live frame for rep completion and feedback
  const analyzeLiveFrame = useCallback(async (currentTime: number) => {
    console.log('analyzeLiveFrame called', {
      poseDataLength: poseDataRef.current.length,
      liveCoachingState: liveCoaching.state,
      currentTime
    })

    if (!poseDataRef.current.length) {
      console.log('No pose data available')
      return
    }
    
    if (liveCoaching.state === 'analyzing') {
      console.log('Already analyzing, skipping')
      return
    }

    console.log('Setting state to analyzing')
    setLiveCoaching(prev => ({
      ...prev,
      state: 'analyzing',
      lastAnalysisTime: currentTime
    }))

    try {
      const latestPose = poseDataRef.current[poseDataRef.current.length - 1]
      console.log('Latest pose:', latestPose)
      
      const token = localStorage.getItem('google_token')
      console.log('Token available:', !!token)
      
      if (!token) {
        console.log('No token, using local detection')
        // Fallback to local detection if no auth
        const repCompleted = detectRepCompletion(latestPose.landmarks, activityName, exerciseState)
        console.log('Local rep detection result:', repCompleted)
        
        if (repCompleted) {
          await handleRepCompletion(currentTime)
        } else {
          await provideContinuousFeedback(latestPose.landmarks, currentTime)
        }
        return
      }

      console.log('Making API call to backend...')
      // Call backend API for analysis
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/live-coaching/analyze-frame/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          activity_type: activityName,
          pose_data: {
            landmarks: latestPose.landmarks,
            timestamp: latestPose.timestamp
          },
          timestamp: currentTime
        })
      })

      console.log('API response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('API response data:', data)
        
        if (data.movement_completed && data.should_provide_feedback) {
          // Backend detected rep completion and has feedback
          const newRepCount = data.rep_count || liveCoaching.repCount + 1
          console.log(`🎯 ${activityName.toUpperCase()} REP COMPLETED! Count: ${newRepCount}`)
          console.log('Backend response:', data)
          
          setLiveCoaching(prev => ({
            ...prev,
            repCount: newRepCount,
            state: 'feedback'
          }))

          setPerformanceStats(prev => ({
            ...prev,
            repCount: newRepCount
          }))

          const repCue: CoachingCue = {
            message: data.feedback,
            type: 'rep_complete',
            timestamp: currentTime,
            repNumber: newRepCount,
            formScore: performanceStats.currentRepScore
          }

          setCurrentCue(repCue)
          setCoachingSession(prev => ({
            ...prev,
            allCues: [...prev.allCues, repCue],
            totalReps: newRepCount
          }))

          await speak(data.feedback, 'rep_complete')

          // Reset for next rep after feedback
          setTimeout(() => {
            setLiveCoaching(prev => ({
              ...prev,
              state: 'monitoring'
            }))
          }, 2000)
          
        } else if (!data.movement_completed) {
          console.log('No rep detected by backend, checking for continuous feedback')
          // No rep detected, check for continuous feedback
          await provideContinuousFeedback(latestPose.landmarks, currentTime)
        }
      } else {
        console.log('API error, falling back to local detection')
        // Fallback to local detection on API error
        const repCompleted = detectRepCompletion(latestPose.landmarks, activityName, exerciseState)
        console.log('Local fallback rep detection result:', repCompleted)
        
        if (repCompleted) {
          await handleRepCompletion(currentTime)
        } else {
          await provideContinuousFeedback(latestPose.landmarks, currentTime)
        }
      }
      
    } catch (error) {
      console.error('Error analyzing live frame:', error)
      // Fallback to local detection on error
      try {
        const latestPose = poseDataRef.current[poseDataRef.current.length - 1]
        const repCompleted = detectRepCompletion(latestPose.landmarks, activityName, exerciseState)
        console.log('Error fallback rep detection result:', repCompleted)
        
        if (repCompleted) {
          await handleRepCompletion(currentTime)
        }
      } catch (fallbackError) {
        console.error('Fallback detection also failed:', fallbackError)
      }
    } finally {
      console.log('Analysis complete, setting state back to monitoring')
      setLiveCoaching(prev => ({
        ...prev,
        state: 'monitoring'
      }))
    }
  }, [])

  // Helper function to calculate angle between three points
  const calculateAngle = (point1: any, point2: any, point3: any): number => {
    const vector1 = { x: point1.x - point2.x, y: point1.y - point2.y }
    const vector2 = { x: point3.x - point2.x, y: point3.y - point2.y }
    
    const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y
    const magnitude1 = Math.sqrt(vector1.x ** 2 + vector1.y ** 2)
    const magnitude2 = Math.sqrt(vector2.x ** 2 + vector2.y ** 2)
    
    const cosine = dotProduct / (magnitude1 * magnitude2)
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI)
    
    return angle
  }

  // Detect rep completion based on activity type
  const detectRepCompletion = (landmarks: any[], activity: string, state: ExerciseState): boolean => {
    const activityLower = activity.toLowerCase()
    
    if (activityLower.includes('jumping jack')) {
      return detectJumpingJackCompletion(landmarks, state)
    } else if (activityLower.includes('squat')) {
      return detectSquatCompletion(landmarks, state)
    } else if (activityLower.includes('push')) {
      return detectPushupCompletion(landmarks, state)
    } else if (activityLower.includes('golf')) {
      return detectGolfSwingCompletion(landmarks, state)
    } else if (activityLower.includes('basketball')) {
      return detectBasketballShotCompletion(landmarks, state)
    }
    
    return false
  }

  // Handle completed rep
  const handleRepCompletion = useCallback(async (currentTime: number) => {
    const newRepCount = liveCoaching.repCount + 1
    
    setLiveCoaching(prev => ({
      ...prev,
      repCount: newRepCount,
      state: 'feedback'
    }))

    setPerformanceStats(prev => ({
      ...prev,
      repCount: newRepCount
    }))

    // Get rep-specific feedback
    const feedback = await getRepFeedback(newRepCount, activityName)
    
    const repCue: CoachingCue = {
      message: feedback,
      type: 'rep_complete',
      timestamp: currentTime,
      repNumber: newRepCount,
      formScore: performanceStats.currentRepScore
    }

    setCurrentCue(repCue)
    setCoachingSession(prev => ({
      ...prev,
      allCues: [...prev.allCues, repCue],
      totalReps: newRepCount
    }))

    await speak(feedback, 'rep_complete')

    // Reset for next rep after feedback
    setTimeout(() => {
      setLiveCoaching(prev => ({
        ...prev,
        state: 'monitoring'
      }))
    }, 2000)

  }, [liveCoaching.repCount, activityName, performanceStats.currentRepScore])

  // Provide continuous form feedback
  const provideContinuousFeedback = useCallback(async (landmarks: any[], currentTime: number) => {
    // Only provide continuous feedback occasionally to avoid overwhelming
    if (currentTime - lastFeedbackTime < 5000) return

    const token = localStorage.getItem('google_token')
    
    if (token) {
      // Try to get AI-powered feedback from backend
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/live-coaching/feedback/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            activity_type: activityName,
            pose_data: {
              landmarks: landmarks,
              timestamp: currentTime
            },
            timestamp: currentTime
          })
        })

        if (response.ok) {
          const data = await response.json()
          
          if (data.should_provide_feedback && data.feedback) {
            const formCue: CoachingCue = {
              message: data.feedback,
              type: 'tip',
              timestamp: currentTime
            }

            setCurrentCue(formCue)
            setLastFeedbackTime(currentTime)
            await speak(data.feedback, 'form_tip')
            return
          }
        }
      } catch (error) {
        console.error('Error getting AI feedback:', error)
      }
    }

    // Fallback to local analysis
    const formFeedback = analyzeCurrentForm(landmarks, activityName)
    
    if (formFeedback) {
      const formCue: CoachingCue = {
        message: formFeedback,
        type: 'tip',
        timestamp: currentTime
      }

      setCurrentCue(formCue)
      setLastFeedbackTime(currentTime)
      await speak(formFeedback, 'form_tip')
    }
  }, [lastFeedbackTime, activityName])

  // Get feedback for completed rep
  const getRepFeedback = async (repNumber: number, activity: string): Promise<string> => {
    const messages = [
      `Great rep ${repNumber}! Keep that form consistent.`,
      `Nice work on rep ${repNumber}! Focus on control.`,
      `Excellent rep ${repNumber}! Remember to breathe.`,
      `Good job on rep ${repNumber}! Maintain that rhythm.`,
      `Perfect rep ${repNumber}! Keep it up!`
    ]
    
    return messages[Math.floor(Math.random() * messages.length)]
  }

  // Analyze current form during movement
  const analyzeCurrentForm = (landmarks: any[], activity: string): string | null => {
    // Basic form analysis - in a real implementation, this would be more sophisticated
    if (!landmarks || landmarks.length < 10) return null
    
    const tips = [
      "Keep your core engaged",
      "Remember to breathe steadily", 
      "Focus on controlled movement",
      "Maintain good posture"
    ]
    
    // Return occasional tips
    if (Math.random() < 0.3) {
      return tips[Math.floor(Math.random() * tips.length)]
    }
    
    return null
  }

  // Individual rep detection functions
  const detectJumpingJackCompletion = (landmarks: any[], state: ExerciseState): boolean => {
    if (!landmarks || landmarks.length < 33) return false
    
    // MediaPipe pose landmarks
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]
    
    if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) {
      return false
    }
    
    // Check arm position - arms up when wrists are above shoulders
    const armsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y
    
    // Check leg position - legs wide when ankles are far apart
    const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x)
    const shoulderDistance = Math.abs(leftShoulder.x - rightShoulder.x)
    const legsWide = ankleDistance > shoulderDistance * 1.5
    
    // Determine current position
    const isJumpingJackUp = armsUp && legsWide
    const isJumpingJackDown = !armsUp && !legsWide
    
    console.log('Jumping jack detection:', {
      currentPhase: state.currentPhase,
      armsUp,
      legsWide,
      isJumpingJackUp,
      isJumpingJackDown,
      ankleDistance: ankleDistance.toFixed(3),
      shoulderDistance: shoulderDistance.toFixed(3)
    })
    
    // Simple state machine for jumping jack detection
    const currentTime = Date.now()
    
    if (state.currentPhase === 'down' && isJumpingJackUp) {
      // Started jumping up
      state.currentPhase = 'up'
      state.lastTransitionTime = currentTime
      console.log('Jumping jack: Up position')
      return false
    } else if (state.currentPhase === 'up' && isJumpingJackDown) {
      // Completed one jumping jack - back to down position
      state.currentPhase = 'down'
      state.lastTransitionTime = currentTime
      console.log('Jumping jack: REP COMPLETED!')
      return true
    }
    
    return false
  }

  const detectSquatCompletion = (landmarks: any[], state: ExerciseState): boolean => {
    if (!landmarks || landmarks.length < 33) return false
    
    // MediaPipe pose landmarks for legs
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const leftKnee = landmarks[25]
    const rightKnee = landmarks[26]
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]
    
    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return false
    }
    
    // Calculate hip height relative to knees and ankles
    const avgHipY = (leftHip.y + rightHip.y) / 2
    const avgKneeY = (leftKnee.y + rightKnee.y) / 2
    const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2
    
    // Calculate knee angle (simplified)
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle)
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle)
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2
    
    // Determine squat phase based on knee angle and hip height
    const isSquatDown = avgKneeAngle < 120 && avgHipY > avgKneeY * 0.9  // Hips low, knees bent
    const isStanding = avgKneeAngle > 150 && avgHipY < avgKneeY * 0.85   // Hips high, knees straight
    
    console.log('Squat detection:', {
      currentPhase: state.currentPhase,
      avgKneeAngle: avgKneeAngle.toFixed(1),
      avgHipY: avgHipY.toFixed(3),
      avgKneeY: avgKneeY.toFixed(3),
      isSquatDown,
      isStanding,
      timeSinceLastRep: Date.now() - state.lastTransitionTime
    })
    
    // Simple state machine for squat detection
    const currentTime = Date.now()
    
    if (state.currentPhase === 'standing' && isSquatDown) {
      // Started going down
      state.currentPhase = 'descending'
      state.lastTransitionTime = currentTime
      console.log('Squat: Started descending')
      return false
    } else if (state.currentPhase === 'descending' && isSquatDown) {
      // At the bottom
      state.currentPhase = 'bottom'
      state.lastTransitionTime = currentTime
      console.log('Squat: At bottom position')
      return false
    } else if (state.currentPhase === 'bottom' && isStanding) {
      // Coming back up to standing - REP COMPLETED!
      state.currentPhase = 'standing'
      state.lastTransitionTime = currentTime
      console.log('Squat: REP COMPLETED!')
      return true
    } else if (state.currentPhase === 'descending' && isStanding) {
      // Went back up without going to bottom (incomplete squat)
      state.currentPhase = 'standing'
      state.lastTransitionTime = currentTime
      console.log('Squat: Incomplete rep - back to standing')
      return false
    }
    
    return false
  }

  const detectPushupCompletion = (landmarks: any[], state: ExerciseState): boolean => {
    if (!landmarks || landmarks.length < 16) return false
    
    // Detect if we went down and pushed back up
    return state.currentPhase === 'up' && Math.random() < 0.1 // Simplified for demo
  }

  const detectGolfSwingCompletion = (landmarks: any[], state: ExerciseState): boolean => {
    if (!landmarks || landmarks.length < 16) return false
    
    // Detect swing completion
    return state.currentPhase === 'follow_through' && Math.random() < 0.08 // Simplified for demo
  }

  const detectBasketballShotCompletion = (landmarks: any[], state: ExerciseState): boolean => {
    if (!landmarks || landmarks.length < 16) return false
    
    // Detect shot completion
    return state.currentPhase === 'release' && Math.random() < 0.1 // Simplified for demo
  }

  // Stop all audio playback (ElevenLabs and browser speech)
  const stopAllAudio = useCallback(() => {
    // Stop ElevenLabs audio
    const existingAudio = document.querySelector('audio[data-coaching-audio]') as HTMLAudioElement
    if (existingAudio) {
      existingAudio.pause()
      existingAudio.remove()
    }
    
    // Stop browser speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }, [])

  // Enhanced text-to-speech function using ElevenLabs
  const speak = useCallback(async (text: string, feedbackType: string = 'tip') => {
    if (!voiceEnabled) return
    
    try {
      // Stop any currently playing audio before starting new audio
      stopAllAudio()
      
      const token = localStorage.getItem('google_token')
      if (!token) {
        console.log('No auth token, using browser speech')
        fallbackToBrowserSpeech(text)
        return
      }
      
      console.log('Attempting ElevenLabs speech for:', text.substring(0, 50) + '...')
      
      // Try ElevenLabs first
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/speech/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: text,
          activity_name: activityName,
          feedback_type: feedbackType
        })
      })
      
      console.log('ElevenLabs response status:', response.status)
      console.log('ElevenLabs response content-type:', response.headers.get('content-type'))
      
      if (response.ok) {
        const contentType = response.headers.get('content-type')
        
        if (contentType?.includes('audio')) {
          // ElevenLabs success - play the audio
          console.log('✅ ElevenLabs audio received, playing...')
          const audioBlob = await response.blob()
          const audioUrl = URL.createObjectURL(audioBlob)
          
          const audio = new Audio(audioUrl)
          audio.setAttribute('data-coaching-audio', 'true')
          audio.volume = 0.8
          
          audio.onended = () => {
            console.log('ElevenLabs audio finished')
            URL.revokeObjectURL(audioUrl)
            audio.remove()
          }
          
          audio.onerror = (e) => {
            console.warn('❌ ElevenLabs audio playback failed:', e)
            fallbackToBrowserSpeech(text)
            URL.revokeObjectURL(audioUrl)
            audio.remove()
          }
          
          document.body.appendChild(audio)
          await audio.play()
          
        } else {
          // Response is not audio, check if it's an error message
          const responseText = await response.text()
          console.warn('❌ ElevenLabs returned non-audio response:', responseText)
          fallbackToBrowserSpeech(text)
        }
        
      } else {
        // ElevenLabs failed - check if it's a service unavailable
        if (response.status === 503) {
          console.warn('⚠️  ElevenLabs service not configured - using browser speech')
          // Show one-time notification if this is the first speech attempt
          if (lastCueRef.current === 0) {
            console.info('💡 To enable high-quality AI voice: Configure ELEVENLABS_API_KEY in backend')
          }
        } else {
          const errorText = await response.text()
          console.warn(`❌ ElevenLabs failed (${response.status}):`, errorText)
        }
        fallbackToBrowserSpeech(text)
      }
      
    } catch (error) {
      console.warn('❌ Speech generation error:', error)
      fallbackToBrowserSpeech(text)
    }
  }, [voiceEnabled, activityName, stopAllAudio])
  
  // Fallback browser speech synthesis
  const fallbackToBrowserSpeech = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.1
    utterance.pitch = 1.0
    utterance.volume = 0.8
    window.speechSynthesis.speak(utterance)
  }, [voiceEnabled])

  // Real-time frame analysis for expert coaching
  const analyzeFrameForCoaching = useCallback(async (landmarks: any[], currentTime: number) => {
    // Rate limiting - analyze every 2-3 seconds
    if (currentTime - lastFrameAnalysis < 2500) return
    
    // Only analyze if we have good pose detection
    if (!landmarks || landmarks.length === 0) return
    
    try {
      // Capture current frame from video
      const canvas = document.createElement('canvas')
      const video = videoRef.current
      if (!video) return
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0)
      
      // Convert to base64
      const frameData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
      
      // Send to backend for expert coaching analysis
      const token = localStorage.getItem('google_token')
      if (!token) return
      
      // Map activity names to backend format
      const activityMap: Record<string, string> = {
        'Basketball Shooting': 'basketball',
        'Squat Form Check': 'squat', 
        'Push-up Technique': 'pushup',
        'Tennis Serve': 'tennis',
        'Golf Swing': 'golf',
        'Custom Activity': 'custom'
      }
      
      const activityType = activityMap[activityName] || 'custom'
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/realtime-coaching/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          frame_data: frameData,
          activity_type: activityType,
          pose_data: {
            landmarks: landmarks,
            timestamp: currentTime
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.feedback) {
          const cue: CoachingCue = {
            message: result.feedback,
            type: 'tip',
            timestamp: currentTime
          }
          addCoachingCue(cue)
          setLastFrameAnalysis(currentTime)
        }
      }
    } catch (error) {
      console.error('Expert coaching analysis failed:', error)
    }
  }, [activityName, lastFrameAnalysis])

  // Calculate text similarity (simple implementation)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const words1 = str1.toLowerCase().split(' ')
    const words2 = str2.toLowerCase().split(' ')
    const commonWords = words1.filter(word => words2.includes(word))
    return commonWords.length / Math.max(words1.length, words2.length)
  }

  // Check if user is in a proper squat position
  const checkIfInProperSquatPosition = (landmarks: any[]): boolean => {
    if (!landmarks || landmarks.length === 0) return false
    
    try {
      // Get key landmarks
      const leftHip = landmarks[23]
      const rightHip = landmarks[24]
      const leftKnee = landmarks[25]
      const rightKnee = landmarks[26]
      const leftAnkle = landmarks[27]
      const rightAnkle = landmarks[28]
      
      if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
        return false
      }
      
      // Check if hips are lower than knees (indicating squat position)
      const avgHipY = (leftHip.y + rightHip.y) / 2
      const avgKneeY = (leftKnee.y + rightKnee.y) / 2
      
      // Check if feet are reasonably spaced (not too close together)
      const feetDistance = Math.abs(leftAnkle.x - rightAnkle.x)
      
      // User is in squat if hips are below knees and feet are spaced
      return avgHipY > avgKneeY && feetDistance > 0.1
      
    } catch (error) {
      return false
    }
  }

  // Add coaching cue with aggressive duplicate prevention
  const addCoachingCue = useCallback((cue: CoachingCue) => {
    const currentTime = Date.now()
    
    // More aggressive duplicate prevention - 20 seconds for exact matches
    const recentCues = coachingSession.allCues.slice(-10) // Check last 10 messages
    const isDuplicate = recentCues.some(recent => 
      recent.message === cue.message && 
      (currentTime - recent.timestamp) < 20000 // 20 seconds
    )
    
    if (isDuplicate) {
      console.log('🚫 Preventing exact duplicate message:', cue.message.substring(0, 50) + '...')
      return
    }
    
    // Prevent similar messages (60% similarity) within 15 seconds
    const isSimilar = recentCues.some(recent => {
      const similarity = calculateSimilarity(recent.message, cue.message)
      return similarity > 0.6 && (currentTime - recent.timestamp) < 15000 // 15 seconds
    })
    
    if (isSimilar) {
      console.log('🚫 Preventing similar message:', cue.message.substring(0, 50) + '...')
      return
    }

    // Rate limiting - max 1 message per 3 seconds
    if (currentTime - lastCueRef.current < 3000) {
      console.log('⏱️  Rate limiting - too soon for next message')
      return
    }

    // Add the cue to coaching session
    console.log('✅ Adding coaching cue:', cue.message.substring(0, 50) + '...')
    setCoachingSession(prev => ({
      ...prev,
      allCues: [...prev.allCues, cue]
    }))
    
    // Add to current rep cues
    setExerciseState(prev => ({
      ...prev,
      currentRepCues: [...prev.currentRepCues, cue]
    }))
    
    // Set current cue for brief display
    setCurrentCue(cue)
    
    // Auto-clear current cue after 3 seconds
    setTimeout(() => {
      setCurrentCue(null)
    }, 3000)

    // Speak the cue if voice is enabled
    if (voiceEnabled) {
      speak(cue.message, cue.type)
    }
    
    lastCueRef.current = currentTime
  }, [coachingSession.allCues, voiceEnabled, speak])

  // AI Analysis for Complete Rep
  const analyzeCompleteRep = useCallback(async (repData: RepData, landmarks: any[]) => {
    if (!voiceEnabled) return // Only analyze if voice coaching is enabled
    
    try {
      const token = localStorage.getItem('google_token')
      if (!token) return
      
      // Send complete rep data to AI for analysis
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analyze-rep/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          activity_type: activityName.toLowerCase(),
          rep_data: {
            number: repData.number,
            startTime: repData.startTime,
            endTime: repData.endTime,
            formScore: repData.formScore,
            phases: repData.phases,
            currentLandmarks: landmarks
          },
          user_context: {
            totalReps: exerciseState.repCount,
            sessionStart: coachingSession.startTime,
            recentPerformance: performanceStats.formScore
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.feedback && result.feedback.trim()) {
          const cue: CoachingCue = {
            message: result.feedback,
            type: 'rep_complete',
            timestamp: Date.now(),
            repNumber: repData.number,
            formScore: repData.formScore
          }
          addCoachingCue(cue)
        }
      }
    } catch (error) {
      console.error('AI rep analysis failed:', error)
    }
  }, [activityName, exerciseState.repCount, coachingSession.startTime, performanceStats.formScore, voiceEnabled, addCoachingCue])

  // Complete a rep and store data
  const completeRep = useCallback((formScore: number, landmarks: any[]) => {
    const now = Date.now()
    const repNumber = exerciseState.repCount + 1

    // Create rep data
    const repData: RepData = {
      number: repNumber,
      startTime: exerciseState.currentRepStartTime,
      endTime: now,
      formScore,
      cuesGiven: exerciseState.currentRepCues,
      phases: exerciseState.currentRepPhases
    }

    // Update exercise state FIRST
    setExerciseState(prev => ({
      ...prev,
      repCount: repNumber,
      currentRepStartTime: now,
      currentRepCues: [],
      currentRepPhases: []
    }))

    // Update performance stats
    setPerformanceStats(prev => ({
      ...prev,
      repCount: repNumber,
      formScore: Math.round((prev.formScore * (repNumber - 1) + formScore) / repNumber),
      bestRepScore: Math.max(prev.bestRepScore, formScore),
      currentRepScore: 100 // Reset for next rep
    }))

    // Update coaching session
    setCoachingSession(prev => ({
      ...prev,
      totalReps: repNumber,
      reps: [...prev.reps, repData],
      averageFormScore: Math.round((prev.averageFormScore * (repNumber - 1) + formScore) / repNumber)
    }))

    // Get AI coaching for this complete rep
    analyzeCompleteRep(repData, landmarks)
    
  }, [exerciseState, analyzeCompleteRep])

  // Get rep completion message with personalized feedback
  function getRepCompletionMessage(repNumber: number, formScore: number): string {
    if (formScore >= 90) {
      return `Rep ${repNumber} - Excellent form! ${formScore}% perfect!`
    } else if (formScore >= 75) {
      return `Rep ${repNumber} - Good form! ${formScore}% - keep improving!`
    } else if (formScore >= 60) {
      return `Rep ${repNumber} - ${formScore}% - focus on your form!`
    } else {
      return `Rep ${repNumber} - ${formScore}% - slow down and focus on technique!`
    }
  }

  // Real-time pose analysis with AI coaching
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

    // Initialize coaching session start time
    if (coachingSession.startTime === 0) {
      setCoachingSession(prev => ({ ...prev, startTime: currentTime }))
      setExerciseState(prev => ({ ...prev, currentRepStartTime: currentTime, phaseStartTime: currentTime }))
    }

    // Real-time AI coaching REMOVED - now only analyze complete reps
    // This prevents constant audio interruption
    
    // Keep basic rep counting for activities that need it
    switch (activityName.toLowerCase()) {
      case 'jumping jacks':
        analyzeJumpingJacksWithStateMachine(landmarks, currentTime)
        break
      case 'squat form check':
      case 'squat form':
        analyzeSquatWithStateMachine(landmarks, currentTime)
        break
      case 'push-up technique':
      case 'push-ups':
        analyzePushupWithStateMachine(landmarks, currentTime)
        break
      case 'golf swing':
        analyzeGolfSwingWithStateMachine(landmarks, currentTime)
        break
      default:
        // For other activities, just do basic rep detection
        break
    }
  }, [activityName, coachingSession.startTime, analyzeFrameForCoaching, isRecording])

  // Jumping Jacks State Machine Analysis
  const analyzeJumpingJacksWithStateMachine = (landmarks: any[], currentTime: number) => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    const leftKnee = landmarks[25]
    const rightKnee = landmarks[26]

    // Calculate positions
    const avgWristHeight = (leftWrist.y + rightWrist.y) / 2
    const avgShoulderHeight = (leftShoulder.y + rightShoulder.y) / 2
    const legWidth = Math.abs(leftKnee.x - rightKnee.x)
    
    // Determine if arms are up (above shoulders) and legs are wide
    // Thresholds tuned for typical camera distance
    const armsUp = avgWristHeight < avgShoulderHeight - 0.05 // wrists at least 5% higher than shoulders
    const legsWide = legWidth > 0.12 // knees at least ~12% of frame apart

    const currentPhase = exerciseState.currentPhase as JumpingJackState
    let newPhase = currentPhase
    let formScore = 80 // Base score
    
    // State machine logic
    switch (currentPhase) {
      case 'down':
        if (armsUp && legsWide) {
          newPhase = 'up'
          formScore = 100
        } else if (armsUp || legsWide) {
          newPhase = 'transitioning_up'
          formScore = 90
        }
        break
        
      case 'transitioning_up':
        if (armsUp && legsWide) {
          newPhase = 'up'
          formScore = 100
        } else if (!armsUp && !legsWide) {
          newPhase = 'down'
          formScore = 85
        }
        break
        
      case 'up':
        if (!armsUp && !legsWide) {
          newPhase = 'down'
          // Complete a rep!
          completeRep(95, landmarks)
          formScore = 95
        } else if (!armsUp || !legsWide) {
          newPhase = 'transitioning_down'
          formScore = 90
        } else {
          formScore = 100 // Perfect position
        }
        break
        
      case 'transitioning_down':
        if (!armsUp && !legsWide) {
          newPhase = 'down'
          // Complete a rep!
          completeRep(90, landmarks)
          formScore = 90
        } else if (armsUp && legsWide) {
          newPhase = 'up'
          formScore = 85
        }
        break
    }

    // Update current rep score
    setPerformanceStats(prev => ({
      ...prev,
      currentRepScore: Math.min(prev.currentRepScore, formScore)
    }))

    // Phase transition
    if (newPhase !== currentPhase) {
      // Store the completed phase
      const phaseData: ExercisePhase = {
        phase: currentPhase,
        startTime: exerciseState.phaseStartTime,
        endTime: currentTime,
        landmarks: landmarks
      }
      
      setExerciseState(prev => ({
        ...prev,
        currentPhase: newPhase,
        phaseStartTime: currentTime,
        lastTransitionTime: currentTime,
        currentRepPhases: [...prev.currentRepPhases, phaseData]
      }))
    }

    // Local coaching feedback REMOVED - now only AI coaching after complete reps
    // This prevents repetitive "Let's start!" messages
  }

  // Adaptive feedback for jumping jacks
  const getAdaptiveJumpingJacksFeedback = (
    phase: JumpingJackState, 
    armsUp: boolean, 
    legsWide: boolean, 
    formScore: number,
    repCount: number
  ): CoachingCue | null => {
    
    // Progressive coaching based on rep count
    if (repCount === 0) {
      return {
        message: "Let's start! Jump your feet wide and raise your arms overhead",
        type: 'tip',
        timestamp: Date.now()
      }
    }

    // Phase-specific feedback
    switch (phase) {
      case 'up':
        if (formScore === 100) {
          return {
            message: "Perfect position! Keep that rhythm going",
            type: 'good',
            timestamp: Date.now()
          }
        } else if (!armsUp) {
          return {
            message: "Reach higher! Get those arms all the way up",
            type: 'warning',
            timestamp: Date.now()
          }
        } else if (!legsWide) {
          return {
            message: "Wider stance! Jump your feet apart",
            type: 'warning',
            timestamp: Date.now()
          }
        }
        break
        
      case 'down':
        if (repCount > 5 && formScore < 80) {
          return {
            message: "Control the landing - feet together, arms down",
            type: 'tip',
            timestamp: Date.now()
          }
        }
        break
        
      case 'transitioning_up':
        return {
          message: "Good! Now reach all the way up",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'transitioning_down':
        return {
          message: "Bring it back down with control",
          type: 'tip',
          timestamp: Date.now()
        }
    }

    return null
  }

  // Squat State Machine Analysis
  const analyzeSquatWithStateMachine = (landmarks: any[], currentTime: number) => {
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const leftKnee = landmarks[25]
    const rightKnee = landmarks[26]
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return
    }

    // Calculate positions
    const avgHipHeight = (leftHip.y + rightHip.y) / 2
    const avgKneeHeight = (leftKnee.y + rightKnee.y) / 2
    const avgAnkleHeight = (leftAnkle.y + rightAnkle.y) / 2
    
    // Determine squat depth (hips below knees)
    const isDeepSquat = avgHipHeight > avgKneeHeight + 0.05
    const isStanding = avgHipHeight < avgKneeHeight - 0.1

    const currentPhase = exerciseState.currentPhase as SquatState
    let newPhase = currentPhase
    let formScore = 80

    // State machine logic
    switch (currentPhase) {
      case 'standing':
        if (!isStanding && !isDeepSquat) {
          newPhase = 'descending'
          formScore = 85
        }
        break
        
      case 'descending':
        if (isDeepSquat) {
          newPhase = 'bottom'
          formScore = 95
        } else if (isStanding) {
          newPhase = 'standing'
          formScore = 70 // Didn't complete
        }
        break
        
      case 'bottom':
        if (!isDeepSquat && !isStanding) {
          newPhase = 'ascending'
          formScore = 90
        } else if (isStanding) {
          newPhase = 'standing'
          completeRep(95, landmarks)
          formScore = 95
        }
        break
        
      case 'ascending':
        if (isStanding) {
          newPhase = 'standing'
          completeRep(90, landmarks)
          formScore = 90
        } else if (isDeepSquat) {
          newPhase = 'bottom'
          formScore = 85
        }
        break
    }

    // Update current rep score
    setPerformanceStats(prev => ({
      ...prev,
      currentRepScore: Math.min(prev.currentRepScore, formScore)
    }))

    // Update phase if changed
    if (newPhase !== currentPhase) {
      const phaseData: ExercisePhase = {
        phase: currentPhase,
        startTime: exerciseState.phaseStartTime,
        endTime: currentTime,
        landmarks: landmarks
      }
      
      setExerciseState(prev => ({
        ...prev,
        currentPhase: newPhase,
        phaseStartTime: currentTime,
        lastTransitionTime: currentTime,
        currentRepPhases: [...prev.currentRepPhases, phaseData]
      }))
    }

    // Local coaching feedback REMOVED - now only AI coaching after complete reps
  }

  // Push-up State Machine Analysis  
  const analyzePushupWithStateMachine = (landmarks: any[], currentTime: number) => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]

    if (!leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !leftWrist || !rightWrist) {
      return
    }

    // Calculate arm extension (simplified)
    const avgShoulderHeight = (leftShoulder.y + rightShoulder.y) / 2
    const avgWristHeight = (leftWrist.y + rightWrist.y) / 2
    const avgElbowHeight = (leftElbow.y + rightElbow.y) / 2
    
    // Determine if arms are extended (up position) or bent (down position)
    const armsExtended = avgWristHeight < avgElbowHeight && avgElbowHeight < avgShoulderHeight
    const armsBent = avgWristHeight > avgElbowHeight - 0.05

    const currentPhase = exerciseState.currentPhase as PushupState
    let newPhase = currentPhase
    let formScore = 80

    // State machine logic
    switch (currentPhase) {
      case 'up':
        if (!armsExtended && armsBent) {
          newPhase = 'descending'
          formScore = 85
        }
        break
        
      case 'descending':
        if (armsBent && !armsExtended) {
          newPhase = 'down'
          formScore = 90
        } else if (armsExtended) {
          newPhase = 'up'
          formScore = 70
        }
        break
        
      case 'down':
        if (!armsBent) {
          newPhase = 'ascending'
          formScore = 85
        }
        break
        
      case 'ascending':
        if (armsExtended) {
          newPhase = 'up'
          completeRep(90, landmarks)
          formScore = 90
        } else if (armsBent) {
          newPhase = 'down'
          formScore = 75
        }
        break
    }

    // Update current rep score
    setPerformanceStats(prev => ({
      ...prev,
      currentRepScore: Math.min(prev.currentRepScore, formScore)
    }))

    // Update phase if changed
    if (newPhase !== currentPhase) {
      const phaseData: ExercisePhase = {
        phase: currentPhase,
        startTime: exerciseState.phaseStartTime,
        endTime: currentTime,
        landmarks: landmarks
      }
      
      setExerciseState(prev => ({
        ...prev,
        currentPhase: newPhase,
        phaseStartTime: currentTime,
        lastTransitionTime: currentTime,
        currentRepPhases: [...prev.currentRepPhases, phaseData]
      }))
    }

    // Local coaching feedback REMOVED - now only AI coaching after complete reps
  }

  // General form analysis for other activities
  const analyzeGeneralForm = (landmarks: any[]): CoachingCue | null => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return null
    }

    // Check posture
    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y)
    const hipTilt = Math.abs(leftHip.y - rightHip.y)

    if (shoulderTilt > 0.05) {
      return {
        message: "Keep your shoulders level",
        type: 'warning',
        timestamp: Date.now()
      }
    }

    if (hipTilt > 0.05) {
      return {
        message: "Keep your hips balanced",
        type: 'warning', 
        timestamp: Date.now()
      }
    }

    return {
      message: "Good posture! Keep it up",
      type: 'good',
      timestamp: Date.now()
    }
  }

  // Feedback helpers
  const getSquatFeedback = (
    phase: SquatState,
    isDeepSquat: boolean,
    isStanding: boolean,
    formScore: number,
    repCount: number
  ): CoachingCue | null => {
    
    if (repCount === 0) {
      return {
        message: "Start with feet shoulder-width apart, squat down low",
        type: 'tip',
        timestamp: Date.now()
      }
    }

    switch (phase) {
      case 'descending':
        return {
          message: "Keep going down! Get those hips below your knees",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'bottom':
        if (formScore >= 90) {
          return {
            message: "Perfect depth! Now drive up through your heels",
            type: 'good',
            timestamp: Date.now()
          }
        }
        return {
          message: "Good! Now push up strong",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'ascending':
        return {
          message: "Drive up! Push through your heels",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'standing':
        if (formScore >= 90) {
          return {
            message: "Excellent squat! Ready for the next one",
            type: 'good',
            timestamp: Date.now()
          }
        }
        break
    }
    
    return null
  }

  // Golf Swing State Machine Analysis
  const analyzeGolfSwingWithStateMachine = (landmarks: any[], currentTime: number) => {
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]

    if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist || !leftHip || !rightHip) {
      return
    }

    // Calculate key golf swing metrics
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x)
    const avgShoulderHeight = (leftShoulder.y + rightShoulder.y) / 2
    const avgWristHeight = (leftWrist.y + rightWrist.y) / 2
    const avgHipHeight = (leftHip.y + rightHip.y) / 2
    const handSpeed = calculateHandSpeed(landmarks)
    
    // Golf stance detection
    const isInGolfStance = checkGolfStance(landmarks)
    const isSwinging = detectSwingMotion(landmarks, currentTime)
    const clubDetected = detectGolfClub(landmarks)

    const currentPhase = exerciseState.currentPhase
    let newPhase = currentPhase
    let formScore = 70 // Base score for golf

    // Golf-specific state machine
    switch (currentPhase) {
      case 'ready':
        if (isInGolfStance && clubDetected) {
          newPhase = 'address'
          formScore = 85
        } else if (!clubDetected && !isInGolfStance) {
          // Only alert if neither club nor stance is detected
          if (currentTime - lastCueRef.current > 8000) {  // Increased interval
            addCoachingCue({
              message: "Get into your golf setup position with hands together",
              type: 'tip',
              timestamp: currentTime
            })
          }
        }
        break
        
      case 'address':
        if (isSwinging && handSpeed > 0.1) {
          newPhase = 'backswing'
          formScore = 90
        } else if (isInGolfStance) {
          formScore = 95 // Good address position
        }
        break
        
      case 'backswing':
        if (avgWristHeight < avgShoulderHeight - 0.3) {
          newPhase = 'top_of_swing'
          formScore = handSpeed > 0.2 ? 95 : 80
        }
        break
        
      case 'top_of_swing':
        if (handSpeed > 0.3) {
          newPhase = 'downswing'
          formScore = 90
        }
        break
        
      case 'downswing':
        if (avgWristHeight > avgHipHeight + 0.1) {
          newPhase = 'impact'
          formScore = 95
        }
        break
        
      case 'impact':
        newPhase = 'follow_through'
        formScore = 100
        break
        
      case 'follow_through':
        if (handSpeed < 0.1) {
          // Complete swing!
          completeRep(formScore, landmarks)
          newPhase = 'address'
        }
        break
    }

    // Update phase if changed
    if (newPhase !== currentPhase) {
      const phaseData: ExercisePhase = {
        phase: currentPhase,
        startTime: exerciseState.phaseStartTime,
        endTime: currentTime,
        landmarks: landmarks
      }
      
      setExerciseState(prev => ({
        ...prev,
        currentPhase: newPhase,
        phaseStartTime: currentTime,
        lastTransitionTime: currentTime,
        currentRepPhases: [...prev.currentRepPhases, phaseData]
      }))
    }

    // Local coaching feedback REMOVED - now only AI coaching after complete reps
  }

  // Helper functions for golf analysis
  const checkGolfStance = (landmarks: any[]): boolean => {
    const leftAnkle = landmarks[27]
    const rightAnkle = landmarks[28]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]
    const nose = landmarks[0]

    if (!leftAnkle || !rightAnkle || !leftHip || !rightHip || !nose) return false

    // Check foot width (should be about shoulder width)
    const feetWidth = Math.abs(leftAnkle.x - rightAnkle.x)
    const shoulderWidth = Math.abs(landmarks[11].x - landmarks[12].x)
    const properFootWidth = feetWidth > shoulderWidth * 0.8 && feetWidth < shoulderWidth * 1.5

    // Check if person is bent forward (golf posture)
    const hipHeight = (leftHip.y + rightHip.y) / 2
    const bentForward = nose.y > hipHeight - 0.2

    return properFootWidth && bentForward
  }

  const detectSwingMotion = (landmarks: any[], currentTime: number): boolean => {
    if (poseDataRef.current.length < 5) return false
    
    const recentFrames = poseDataRef.current.slice(-5)
    const wristMovement = calculateWristMovement(recentFrames)
    
    return wristMovement > 0.05 // Threshold for swing motion
  }

  const detectGolfClub = (landmarks: any[]): boolean => {
    // Simplified club detection - assume club is present if person is in golf stance
    // Let the AI do the actual visual club detection through video analysis
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]

    if (!leftWrist || !rightWrist) return false

    // Very lenient detection - just check if hands are roughly in front of body
    // indicating any kind of golf grip posture
    const handDistance = Math.sqrt(
      Math.pow(leftWrist.x - rightWrist.x, 2) + Math.pow(leftWrist.y - rightWrist.y, 2)
    )
    
    // Much more lenient detection - allow for various grip styles and camera angles
    return handDistance < 0.3  // Increased from 0.1 to 0.3 for more flexibility
  }

  const calculateHandSpeed = (landmarks: any[]): number => {
    if (poseDataRef.current.length < 3) return 0
    
    const recent = poseDataRef.current.slice(-3)
    const wrist = landmarks[15] || landmarks[16]
    
    if (!wrist) return 0
    
    let totalMovement = 0
    for (let i = 1; i < recent.length; i++) {
      const prevWrist = recent[i-1].landmarks[15] || recent[i-1].landmarks[16]
      const currWrist = recent[i].landmarks[15] || recent[i].landmarks[16]
      
      if (prevWrist && currWrist) {
        totalMovement += Math.sqrt(
          Math.pow(currWrist.x - prevWrist.x, 2) + Math.pow(currWrist.y - prevWrist.y, 2)
        )
      }
    }
    
    return totalMovement / recent.length
  }

  const calculateWristMovement = (frames: PoseData[]): number => {
    if (frames.length < 2) return 0
    
    let totalMovement = 0
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i-1].landmarks[15] || frames[i-1].landmarks[16]
      const curr = frames[i].landmarks[15] || frames[i].landmarks[16]
      
      if (prev && curr) {
        totalMovement += Math.sqrt(
          Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
        )
      }
    }
    
    return totalMovement / frames.length
  }

  const getGolfSwingFeedback = (
    phase: string,
    isInGolfStance: boolean,
    clubDetected: boolean,
    formScore: number,
    swingCount: number
  ): CoachingCue | null => {
    
    // Focus on stance and form rather than strict club detection
    if (!clubDetected && !isInGolfStance) {
      return {
        message: "Set up your golf stance with hands together as if holding a club",
        type: 'tip',
        timestamp: Date.now()
      }
    }

    // Stance feedback
    if (phase === 'ready' && !isInGolfStance) {
      return {
        message: "Set up your golf stance: feet shoulder-width apart, bend at the waist, knees slightly flexed",
        type: 'tip',
        timestamp: Date.now()
      }
    }

    // Phase-specific feedback
    switch (phase) {
      case 'address':
        if (swingCount === 0) {
          return {
            message: "Good setup! When ready, start your backswing smoothly",
            type: 'good',
            timestamp: Date.now()
          }
        }
        break
        
      case 'backswing':
        return {
          message: "Nice backswing! Turn your shoulders and maintain your posture",
          type: 'good',
          timestamp: Date.now()
        }
        
      case 'downswing':
        return {
          message: "Smooth transition! Focus on hitting through the ball",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'follow_through':
        return {
          message: "Great swing! Hold that finish position",
          type: 'good',
          timestamp: Date.now()
        }
        
      case 'finish':
        if (formScore >= 85) {
          return {
            message: `Swing ${swingCount + 1} complete! ${formScore}% - Excellent form!`,
            type: 'rep_complete',
            timestamp: Date.now()
          }
        } else {
          return {
            message: `Swing ${swingCount + 1} complete! ${formScore}% - Focus on tempo and balance`,
            type: 'rep_complete',
            timestamp: Date.now()
          }
        }
    }

    return null
  }

  const getPushupFeedback = (
    phase: PushupState,
    armsExtended: boolean,
    armsBent: boolean,
    formScore: number,
    repCount: number
  ): CoachingCue | null => {
    
    if (repCount === 0) {
      return {
        message: "Start in plank position, lower your chest down",
        type: 'tip',
        timestamp: Date.now()
      }
    }

    switch (phase) {
      case 'descending':
        return {
          message: "Lower down with control, chest to the ground",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'down':
        return {
          message: "Perfect! Now push up strong",
          type: 'good',
          timestamp: Date.now()
        }
        
      case 'ascending':
        return {
          message: "Push up! Fully extend those arms",
          type: 'tip',
          timestamp: Date.now()
        }
        
      case 'up':
        if (formScore >= 90) {
          return {
            message: "Great push-up! Keep that form",
            type: 'good',
            timestamp: Date.now()
          }
        }
        break
    }
    
    return null
  }

  // Keep analyzePoseRef synced with latest callback
  useEffect(() => {
    analyzePoseRef.current = analyzePose
  }, [analyzePose])

  // Initialize MediaPipe Pose ONCE
  useEffect(() => {
    const initializePose = async () => {
      let pose: Pose | null = null
      
      try {
        // Slight delay ensures DOM & video elements settle before WASM load (avoids buffer error)
        await new Promise((res) => setTimeout(res, 100))
        
        // Try multiple CDN sources for MediaPipe to avoid WASM errors
        const cdnOptions = [
          // Primary: JSDelivr CDN
          (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          // Fallback 1: unpkg CDN
          (file: string) => `https://unpkg.com/@mediapipe/pose/${file}`,
          // Fallback 2: Google's CDN
          (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
        ]
        
        for (let i = 0; i < cdnOptions.length; i++) {
          try {
            console.log(`Attempting MediaPipe initialization with CDN option ${i + 1}`)
            
            pose = new Pose({
              locateFile: cdnOptions[i]
            })

            // Test if pose can be configured without errors
            pose.setOptions({
              modelComplexity: 1,
              smoothLandmarks: true,
              enableSegmentation: false, // Disable to reduce WASM complexity
              smoothSegmentation: false,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5
            })
            
            // If we get here, initialization succeeded
            console.log(`MediaPipe initialization successful with CDN option ${i + 1}`)
            break
            
          } catch (cdnError) {
            console.warn(`CDN option ${i + 1} failed:`, cdnError)
            if (pose) {
              try {
                pose.close()
              } catch (e) {
                // ignore cleanup errors
              }
              pose = null
            }
            
            // If this is the last option, re-throw the error
            if (i === cdnOptions.length - 1) {
              throw cdnError
            }
          }
        }
        
        if (!pose) {
          throw new Error('All MediaPipe CDN options failed')
        }

        // Mark pose as ready right after successful instantiation
        poseReadyRef.current = true

        pose.onResults((results) => {
          if (!canvasRef.current || !videoRef.current) return

          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height)

          if (results.poseLandmarks) {
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
              color: '#00FF00',
              lineWidth: 4
            })
            drawLandmarks(ctx, results.poseLandmarks, {
              color: '#FF0000',
              lineWidth: 2,
              radius: 6
            })

            // Use the latest analyzePose callback without re-creating Pose instance
            analyzePoseRef.current(results.poseLandmarks)
          }
        })

        poseRef.current = pose
        
      } catch (error) {
        console.error('MediaPipe initialization failed after all attempts:', error)
        
        // Provide more helpful error message based on error type
        let errorMessage = 'Failed to initialize pose detection. '
        if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
          const errorStr = error.message.toLowerCase()
          if (errorStr.includes('module.arguments')) {
            errorMessage += 'Browser compatibility issue detected. Try refreshing or using a different browser.'
          } else if (errorStr.includes('network') || errorStr.includes('fetch')) {
            errorMessage += 'Network connection issue. Please check your internet connection and try again.'
          } else {
            errorMessage += 'Please refresh the page and try again.'
          }
        } else {
          errorMessage += 'Please refresh the page and try again.'
        }
        
        setError(errorMessage)
        
        // Track MediaPipe initialization failure
        if (op) {
          op.track('mediapipe_init_failed', {
            error: String(error),
            activityName: activityName,
            browser: navigator.userAgent
          })
        }
      }
    }

    initializePose()

    return () => {
      // Ensure camera is stopped before closing Pose to avoid callbacks after disposal
      if (cameraRef.current) {
        cameraRef.current.stop()
      }
      if (poseRef.current) {
        poseRef.current.close()
      }
    }
  }, [])

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
      // Cleanup live coaching interval
      if (liveCoachingIntervalRef.current) {
        clearInterval(liveCoachingIntervalRef.current)
      }
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
                if (poseRef.current && videoRef.current && poseReadyRef.current) {
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
        totalFrames: 0,
        currentRepScore: 100,
        bestRepScore: 0
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
        
        speak("Recording complete! Processing your analysis...", 'tip')
        onVideoRecorded(blob, coachingSession)
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

      // Tailored setup message per activity
      const setupMessageMap: Record<string, string> = {
        'jumping jacks': 'Get ready! Start with feet together and arms at your sides. Begin your jumping jacks when you hear the beep.',
        'squat form check': 'Stand tall with feet shoulder-width apart. Push hips back and get ready for your first squat.',
        'push-up technique': 'Place your hands under your shoulders and keep your body in a straight line. Lower yourself for the first push-up when ready.',
        'golf swing': 'Address the ball with your stance. When you\'re ready, make a full swing and hold your finish.'
      }

      const setupMsg = setupMessageMap[activityName.toLowerCase()] || 'Get into position and perform your first rep when ready.'
      addCoachingCue({ message: setupMsg, type: 'tip', timestamp: Date.now() })

      // Start countdown timer
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopRecording()
            return 0
          }
          
          // Voice countdown for last 5 seconds
          if (prev <= 5 && voiceEnabled) {
            speak(prev.toString(), 'tip')
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
    
    // If disabling voice, immediately stop all audio
    if (!newVoiceEnabled) {
      stopAllAudio()
    }
    
    setVoiceEnabled(newVoiceEnabled)
    
    // Save preference to localStorage
    localStorage.setItem('voice_coaching_enabled', newVoiceEnabled.toString())
    
    if (newVoiceEnabled) {
      speak("Voice coaching enabled", 'tip')
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
    <div className="min-h-screen bg-black flex">
      {/* Camera Section (Left - 70% on desktop, full on mobile when chat is hidden) */}
      <div className={`relative ${showChatLog ? 'w-full md:w-3/4' : 'w-full'} transition-all duration-300`}>
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

        {/* Minimal UI Overlay - Only Essential Controls */}
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
          {/* Minimal Header */}
          <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center justify-between text-white">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              
              <div className="text-center">
                {/* Live Coaching Status */}
                {liveCoaching.mode === 'live' && (
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-xs">Live Coaching</span>
                    <span className="text-xs text-blue-400">• {liveCoaching.repCount} reps</span>
                  </div>
                )}
                {liveCoaching.mode === 'paused' && (
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-xs">Paused</span>
                  </div>
                )}
                {/* Recording Status */}
                {isRecording && (
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full recording-indicator"></div>
                    <span className="text-sm font-mono">{timeRemaining}s</span>
                  </div>
                )}
                {!isRecording && liveCoaching.mode === 'setup' && poseDetected && (
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs">Ready</span>
                  </div>
                )}
              </div>

              <div className="flex space-x-1">
                <button
                  onClick={() => setShowChatLog(!showChatLog)}
                  className={`p-2 rounded-full transition-colors ${
                    showChatLog ? 'bg-blue-600/80' : 'bg-white/20'
                  } hover:bg-white/30`}
                >
                  <ChatBubbleLeftRightIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleVoice}
                  className={`p-2 rounded-full transition-colors ${
                    voiceEnabled ? 'bg-green-600/80' : 'bg-white/20'
                  } hover:bg-white/30`}
                >
                  {voiceEnabled ? (
                    <SpeakerWaveIcon className="w-5 h-5" />
                  ) : (
                    <SpeakerXMarkIcon className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={toggleCamera}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <ArrowPathIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Performance Stats - Top Right */}
          {/* Prominent Squat Counter - Large and Central */}
          {(activityName.toLowerCase().includes('squat') && (liveCoaching.mode === 'live' || liveCoaching.mode === 'setup')) && (
            <div className="absolute top-1/2 left-6 transform -translate-y-1/2 z-20">
              <div className="bg-blue-600/90 backdrop-blur-sm rounded-2xl p-6 text-white text-center shadow-2xl border-2 border-blue-400">
                <div className="text-5xl font-bold text-white mb-2">
                  {liveCoaching.repCount || 0}
                </div>
                <div className="text-lg opacity-90 font-medium">
                  SQUATS
                </div>
                <div className="text-sm opacity-70 mt-1">
                  COMPLETED
                </div>
              </div>
            </div>
          )}

          {/* Regular Rep Counter for Other Activities */}
          {(!activityName.toLowerCase().includes('squat') && (isRecording || liveCoaching.mode === 'live') && (liveCoaching.repCount > 0 || exerciseState.repCount > 0)) && (
            <div className="absolute top-16 right-3 bg-black/50 backdrop-blur-sm rounded-lg p-2 text-white text-xs">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-400">
                  {liveCoaching.mode === 'live' ? liveCoaching.repCount : exerciseState.repCount}
                </div>
                <div className="text-xs opacity-80">
                  {activityName.toLowerCase() === 'golf swing' ? 'Swings' : 'Reps'}
                </div>
                {liveCoaching.mode === 'live' && (
                  <div className="text-xs text-green-400 mt-1">Live</div>
                )}
              </div>
            </div>
          )}

          {/* Simple Recording Progress - Bottom Center */}
          {isRecording && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
              <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white text-center">
                <div className="text-lg font-bold">{timeRemaining}s</div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center justify-center space-x-4">
              {/* Live Coaching Controls */}
              {liveCoaching.mode === 'setup' && !isRecording && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startLiveCoaching}
                  className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors shadow-lg"
                >
                  <EyeIcon className="w-6 h-6 text-white" />
                </motion.button>
              )}
              
              {liveCoaching.mode === 'live' && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleLiveCoaching}
                  className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center hover:bg-yellow-700 transition-colors shadow-lg"
                >
                  <PauseIcon className="w-5 h-5 text-white" />
                </motion.button>
              )}
              
              {liveCoaching.mode === 'paused' && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleLiveCoaching}
                  className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center hover:bg-green-700 transition-colors shadow-lg"
                >
                  <PlayIcon className="w-5 h-5 text-white" />
                </motion.button>
              )}
              
              {(liveCoaching.mode === 'live' || liveCoaching.mode === 'paused') && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={stopLiveCoaching}
                  className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
                >
                  <StopIcon className="w-5 h-5 text-white" />
                </motion.button>
              )}

              {/* Recording Controls */}
              {!isRecording && liveCoaching.mode !== 'live' && liveCoaching.mode !== 'paused' ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startRecording}
                  className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
                >
                  <VideoCameraIcon className="w-6 h-6 text-white" />
                </motion.button>
              ) : isRecording ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
                >
                  <StopIcon className="w-6 h-6 text-white" />
                </motion.button>
              ) : null}
            </div>
            
            {/* Instructions */}
            {liveCoaching.mode === 'setup' && !isRecording && (
              <p className="text-white text-center text-xs mt-2 opacity-80">
                <span className="text-blue-400">Tap eye icon for live coaching</span> • <span className="text-red-400">Tap video icon to record</span>
              </p>
            )}
            {liveCoaching.mode === 'live' && (
              <p className="text-white text-center text-xs mt-2 opacity-80">
                Live coaching active • Rep count: {liveCoaching.repCount}
              </p>
            )}
            {liveCoaching.mode === 'paused' && (
              <p className="text-white text-center text-xs mt-2 opacity-80">
                Live coaching paused • Tap play to resume
              </p>
            )}
            {isRecording && (
              <p className="text-white text-center text-xs mt-2 opacity-80">
                Recording... Live coaching in chat panel
              </p>
            )}
          </div>
        </div>
      </div>

            {/* Chat Panel (Right - 30% on desktop, overlay on mobile) */}
      {showChatLog && (
        <div className={`
          fixed md:relative 
          ${showChatLog ? 'right-0' : '-right-full'} 
          top-0 h-screen
          w-full md:w-1/4 
          bg-gray-900 
          transition-all duration-300 
          z-30 md:z-auto
          flex flex-col
          max-h-screen
        `}>
          {/* Chat Header */}
          <div className="bg-gray-800 p-3 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold text-sm">{activityName}</h2>
                <p className="text-gray-400 text-xs">Live Coaching</p>
              </div>
              <button
                onClick={() => setShowChatLog(false)}
                className="md:hidden p-1 text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
          </div>
          
          {/* Enhanced Chat Log with Fixed Height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CoachingChatLog 
              cues={coachingSession.allCues}
              currentPhase={exerciseState.currentPhase}
              repCount={exerciseState.repCount}
              isVisible={true}
            />
          </div>
        </div>
      )}
    </div>
  )
} 