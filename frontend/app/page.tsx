'use client'

import { useState, useEffect } from 'react'
import { useOpenPanel } from '@openpanel/nextjs'
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
  const op = useOpenPanel()

  useEffect(() => {
    if (user && token && step === 'signin') {
      setStep('picker')
    } else if (!user && step !== 'signin') {
      setStep('signin')
    }
  }, [user, token, step])

  useEffect(() => {
    if (user && op) {
      op.identify({
        profileId: user.id,
        email: user.email,
        firstName: user.given_name,
        lastName: user.family_name,
      })
      
      op.track('user_signed_in', {
        email: user.email,
        name: user.name,
        signInMethod: 'google'
      })
    }
  }, [user, op])

  const handleActivitySelected = (template: ActivityTemplate | null, customPrompt?: string) => {
    setSelectedTemplate(template)
    setCustomPrompt(customPrompt || '')
    setStep('recording')
    
    if (op) {
      op.track('activity_selected', {
        activityType: template ? 'template' : 'custom',
        activityName: template?.name || 'Custom Analysis',
        templateId: template?.id,
        hasCustomPrompt: !!customPrompt
      })
    }
  }

  const handleVideoRecorded = (blob: Blob) => {
    setVideoBlob(blob)
    setStep('results')
    
    if (op) {
      op.track('video_recorded', {
        activityName: selectedTemplate?.name || 'Custom Analysis',
        videoSize: blob.size,
        templateId: selectedTemplate?.id
      })
    }
  }

  const handleStartAnalysis = async () => {
    if (!videoBlob || !user) return
    
    setIsAnalyzing(true)
    setAnalysisResult(null)
    
    if (op) {
      op.track('analysis_started', {
        activityName: selectedTemplate?.name || 'Custom Analysis',
        templateId: selectedTemplate?.id,
        videoSize: videoBlob.size
      })
    }

    try {
      const formData = new FormData()
      formData.append('video', videoBlob)
      
      if (selectedTemplate) {
        formData.append('template_id', selectedTemplate.id.toString())
      } else {
        formData.append('custom_prompt', customPrompt)
      }

      const token = localStorage.getItem('google_token')
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/analyze/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setAnalysisResult(result)
        
        if (op) {
          op.track('analysis_completed', {
            activityName: selectedTemplate?.name || 'Custom Analysis',
            templateId: selectedTemplate?.id,
            success: true,
            analysisLength: result.analysis?.length || 0
          })
        }
      } else {
        const error = await response.text()
        console.error('Analysis failed:', error)
        setAnalysisResult({
          success: false,
          analysis: 'Analysis failed. Please try again.',
          analysis_type: 'Error',
          error: error
        })
        
        if (op) {
          op.track('analysis_failed', {
            activityName: selectedTemplate?.name || 'Custom Analysis',
            templateId: selectedTemplate?.id,
            error: error,
            statusCode: response.status
          })
        }
      }
    } catch (error) {
      console.error('Analysis error:', error)
      setAnalysisResult({
        success: false,
        analysis: 'Analysis failed. Please try again.',
        analysis_type: 'Error',
        error: String(error)
      })
      
      if (op) {
        op.track('analysis_error', {
          activityName: selectedTemplate?.name || 'Custom Analysis',
          templateId: selectedTemplate?.id,
          error: String(error)
        })
      }
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
    
    if (op) {
      op.track('try_again_clicked', {
        fromStep: 'results'
      })
    }
  }

  const handleSignOut = () => {
    if (op) {
      op.track('user_signed_out', {
        userId: user?.id
      })
    }
    
    signOut()
    setStep('signin')
    setVideoBlob(null)
    setAnalysisResult(null)
    setSelectedTemplate(null)
    setCustomPrompt('')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Full width for video recording */}
      {step === 'recording' && (
        <VideoRecorder 
          onVideoRecorded={handleVideoRecorded}
          onBack={() => setStep('picker')}
          activityName={selectedTemplate?.name || 'Custom Analysis'}
        />
      )}
      
      {/* Constrained width for other steps */}
      {step !== 'recording' && (
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
      )}
    </main>
  )
} 