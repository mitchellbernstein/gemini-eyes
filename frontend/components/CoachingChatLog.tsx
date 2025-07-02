'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  LightBulbIcon,
  TrophyIcon
} from '@heroicons/react/24/outline'

interface CoachingCue {
  message: string
  type: 'good' | 'warning' | 'tip' | 'rep_complete'
  timestamp: number
  repNumber?: number
  formScore?: number
}

interface Props {
  cues: CoachingCue[]
  currentPhase: string
  repCount: number
  isVisible: boolean
}

export default function CoachingChatLog({ cues, currentPhase, repCount, isVisible }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current && cues.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [cues.length])

  if (!isVisible) return null

  const getIcon = (type: string) => {
    switch (type) {
      case 'good':
        return <CheckCircleIcon className="w-4 h-4 text-green-400" />
      case 'warning':
        return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
      case 'tip':
        return <LightBulbIcon className="w-4 h-4 text-blue-400" />
      case 'rep_complete':
        return <TrophyIcon className="w-4 h-4 text-purple-400" />
      default:
        return <CheckCircleIcon className="w-4 h-4 text-gray-400" />
    }
  }

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'good':
        return 'text-green-200 bg-green-900/30 border-green-700/50'
      case 'warning':
        return 'text-yellow-200 bg-yellow-900/30 border-yellow-700/50'
      case 'tip':
        return 'text-blue-200 bg-blue-900/30 border-blue-700/50'
      case 'rep_complete':
        return 'text-purple-200 bg-purple-900/30 border-purple-700/50'
      default:
        return 'text-gray-200 bg-gray-800/50 border-gray-600/50'
    }
  }

  const formatTime = (timestamp: number, startTime?: number) => {
    if (startTime) {
      // Show time from start of recording
      const seconds = Math.floor((timestamp - startTime) / 1000)
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`
    }
    
    // Fallback to relative time
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    return `${Math.floor(seconds / 60)}m ago`
  }

  const getActivityUnit = (phase: string) => {
    if (phase.includes('golf') || phase.includes('swing')) return 'Swings'
    if (phase.includes('squat') || phase.includes('jack') || phase.includes('push')) return 'Reps'
    return 'Reps'
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cues.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <LightBulbIcon className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            <p className="text-sm">AI coaching will appear here as you exercise</p>
            <p className="text-xs mt-1 opacity-70">Start recording to get real-time feedback!</p>
          </div>
        ) : (
          <>
            {cues.map((cue, index) => (
              <motion.div
                key={`${cue.timestamp}-${index}`}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`p-2.5 rounded-lg border ${getMessageColor(cue.type)}`}
              >
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0 mt-0.5">
                    {getIcon(cue.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed break-words">
                      {cue.message}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs opacity-60">
                        {formatTime(cue.timestamp)}
                      </span>
                      {cue.repNumber && (
                        <span className="text-xs font-medium bg-gray-700 px-1.5 py-0.5 rounded">
                          Rep {cue.repNumber}
                        </span>
                      )}
                      {cue.formScore && (
                        <span className="text-xs font-semibold text-green-400">
                          {cue.formScore}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Footer Stats */}
      {repCount > 0 && (
        <div className="p-3 border-t border-gray-700 bg-gray-800/50">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-lg font-bold text-white">{repCount}</div>
              <div className="text-xs text-gray-400">{getActivityUnit(currentPhase)}</div>
            </div>
            <div>
              <div className="text-lg font-bold text-white">{cues.length}</div>
              <div className="text-xs text-gray-400">AI Tips</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 