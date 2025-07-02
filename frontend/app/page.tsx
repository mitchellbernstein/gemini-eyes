'use client'

import { useState, useEffect } from 'react'
import GoogleSignIn from '@/components/GoogleSignIn'
import ActivityPicker from '@/components/ActivityPicker'
import VideoRecorder from '@/components/VideoRecorder'
import ResultsDisplay from '@/components/ResultsDisplay'
import { useAuth } from '@/hooks/useAuth'

export type AppStep = 'signin' | 'picker' | 'recording' | 'results'

export interface ActivityTemplate {
  id: string
  name: string
  icon: string
  description: string
  prompt: string
  category: string
}

export interface AnalysisResult {
  success: boolean
  analysis: string
  analysis_type: string
  frames_analyzed?: number
  remaining_analyses?: {
    daily: number
    hourly: number
  }
  error?: string
}

export default function Home() {
  const [step, setStep] = useState<AppStep>('signin')
  const [selectedTemplate, setSelectedTemplate] = useState<ActivityTemplate | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const { user, token, signOut } = useAuth()

  useEffect(() => {
    if (user && token && step === 'signin') {
      setStep('picker')
    } else if (!user && step !== 'signin') {
      setStep('signin')
    }
  }, [user, token, step])

  const handleActivitySelected = (template: ActivityTemplate | null, prompt: string = '') => {
    setSelectedTemplate(template)
    setCustomPrompt(prompt)
    setStep('recording')
  }

  const handleVideoRecorded = (blob: Blob) => {
    setVideoBlob(blob)
    setStep('results')
  }

  const handleStartAnalysis = async () => {
    if (!videoBlob || !token) return

    setIsAnalyzing(true)
    
    try {
      const formData = new FormData()
      formData.append('video', videoBlob, 'recording.webm')
      
      if (selectedTemplate) {
        formData.append('template_id', selectedTemplate.id)
      } else if (customPrompt) {
        formData.append('custom_prompt', customPrompt)
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analyze/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      const result = await response.json()
      setAnalysisResult(result)
    } catch (error) {
      console.error('Analysis failed:', error)
      setAnalysisResult({
        success: false,
        analysis: 'Sorry, analysis failed. Please try again.',
        analysis_type: 'Error',
        error: 'Network error'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleTryAgain = () => {
    setVideoBlob(null)
    setAnalysisResult(null)
    setSelectedTemplate(null)
    setCustomPrompt('')
    setStep('picker')
  }

  const handleSignOut = () => {
    signOut()
    setStep('signin')
    setVideoBlob(null)
    setAnalysisResult(null)
    setSelectedTemplate(null)
    setCustomPrompt('')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-[640px] mx-auto">
        {step === 'signin' && (
          <GoogleSignIn />
        )}
        
        {step === 'picker' && user && (
          <ActivityPicker 
            user={user}
            onActivitySelected={handleActivitySelected}
            onSignOut={handleSignOut}
          />
        )}
        
        {step === 'recording' && (
          <VideoRecorder 
            onVideoRecorded={handleVideoRecorded}
            onBack={() => setStep('picker')}
            activityName={selectedTemplate?.name || 'Custom Analysis'}
          />
        )}
        
        {step === 'results' && videoBlob && (
          <ResultsDisplay 
            videoBlob={videoBlob}
            analysisResult={analysisResult}
            isAnalyzing={isAnalyzing}
            onStartAnalysis={handleStartAnalysis}
            onTryAgain={handleTryAgain}
            onBack={() => setStep('recording')}
          />
        )}
      </div>
    </main>
  )
} 