'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  PlayIcon, 
  PauseIcon, 
  ArrowLeftIcon,
  ArrowPathIcon,
  ShareIcon
} from '@heroicons/react/24/outline'
import { AnalysisResult } from '@/app/page'

interface Props {
  videoBlob: Blob
  analysisResult: AnalysisResult | null
  isAnalyzing: boolean
  onStartAnalysis: () => void
  onTryAgain: () => void
  onBack: () => void
}

export default function ResultsDisplay({ 
  videoBlob, 
  analysisResult, 
  isAnalyzing, 
  onStartAnalysis, 
  onTryAgain, 
  onBack 
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(videoBlob)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [videoBlob])

  useEffect(() => {
    if (!analysisResult && !isAnalyzing) {
      onStartAnalysis()
    }
  }, [])

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const shareResults = async () => {
    if (navigator.share && analysisResult) {
      try {
        await navigator.share({
          title: 'My AI Activity Analysis',
          text: analysisResult.analysis,
        })
      } catch (error) {
        console.log('Sharing failed:', error)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
        >
          <ArrowLeftIcon className="w-6 h-6 text-gray-700" />
        </button>
        
        <h1 className="text-lg font-semibold text-gray-900">Analysis Results</h1>
        
        <button
          onClick={shareResults}
          disabled={!analysisResult}
          className="p-2 hover:bg-white/50 rounded-full transition-colors disabled:opacity-50"
        >
          <ShareIcon className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {/* Video Player */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black rounded-2xl overflow-hidden mb-6 relative"
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-64 object-cover"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          playsInline
        />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={togglePlay}
            className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            {isPlaying ? (
              <PauseIcon className="w-8 h-8 text-white" />
            ) : (
              <PlayIcon className="w-8 h-8 text-white ml-1" />
            )}
          </button>
        </div>
      </motion.div>

      {/* Analysis Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl p-6 shadow-lg"
      >
        {isAnalyzing ? (
          <div className="text-center py-8">
            <div className="spinner mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Analyzing your video...
            </h3>
            <p className="text-gray-600">
              Our AI is reviewing your performance and generating feedback
            </p>
          </div>
        ) : analysisResult ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                AI Feedback
              </h3>
              <span className="text-sm text-gray-500">
                {analysisResult.analysis_type}
              </span>
            </div>
            
            <div className="prose prose-gray max-w-none">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {analysisResult.analysis}
              </p>
            </div>
            
            {analysisResult.frames_analyzed && (
              <div className="mt-4 text-xs text-gray-500">
                Analyzed {analysisResult.frames_analyzed} frames
              </div>
            )}
            
            {analysisResult.remaining_analyses && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  Remaining today: {analysisResult.remaining_analyses.daily} | 
                  This hour: {analysisResult.remaining_analyses.hourly}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Analysis Failed
            </h3>
            <p className="text-gray-600 mb-4">
              We couldn't analyze your video. Please try again.
            </p>
          </div>
        )}
      </motion.div>

      {/* Action Buttons */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex space-x-4 mt-6"
      >
        <button
          onClick={onTryAgain}
          className="flex-1 flex items-center justify-center space-x-2 bg-white text-gray-700 border border-gray-200 py-3 px-4 rounded-xl font-medium hover:bg-gray-50 transition-colors"
        >
          <ArrowPathIcon className="w-5 h-5" />
          <span>Try Again</span>
        </button>
        
        {analysisResult && (
          <button
            onClick={shareResults}
            className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <ShareIcon className="w-5 h-5" />
            <span>Share</span>
          </button>
        )}
      </motion.div>
    </div>
  )
} 