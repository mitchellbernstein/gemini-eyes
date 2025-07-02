'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useOpenPanel } from '@openpanel/nextjs'
import { ArrowRightIcon, PlusIcon } from '@heroicons/react/24/outline'
import { ActivityTemplate } from '@/app/page'

interface User {
  name: string
  email: string
  picture: string
}

interface Props {
  user: User
  onActivitySelected: (template: ActivityTemplate | null, customPrompt?: string) => void
  onSignOut: () => void
}

export default function ActivityPicker({ user, onActivitySelected, onSignOut }: Props) {
  const [templates, setTemplates] = useState<ActivityTemplate[]>([])
  const [customPrompt, setCustomPrompt] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [userLimits, setUserLimits] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const op = useOpenPanel()

  useEffect(() => {
    // Only fetch if we have a valid token
    const token = localStorage.getItem('google_token')
    if (token) {
      fetchTemplates()
      fetchUserLimits()
    } else {
      // If no token, set loading to false to show the UI
      setLoading(false)
    }
  }, [])

  // Also listen for auth changes in case token becomes available later
  useEffect(() => {
    const handleAuthSuccess = () => {
      const token = localStorage.getItem('google_token')
      if (token && templates.length === 0) {
        setLoading(true)
        fetchTemplates()
        fetchUserLimits()
      }
    }
    
    window.addEventListener('auth-success', handleAuthSuccess)
    return () => window.removeEventListener('auth-success', handleAuthSuccess)
  }, [templates.length])

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('google_token')

      if (!token) {
        console.error('No token available for templates fetch')
        return
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/templates/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates)
        
        // Track templates loaded
        if (op) {
          op.track('templates_loaded', {
            templateCount: data.templates.length,
            templates: data.templates.map((t: ActivityTemplate) => t.name)
          })
        }
      } else if (response.status === 401) {
        // Token expired - clear it and redirect to sign in
        localStorage.removeItem('google_token')
        localStorage.removeItem('user_info')
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      
      // Track template loading error
      if (op) {
        op.track('templates_load_error', {
          error: String(error)
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchUserLimits = async () => {
    try {
      const token = localStorage.getItem('google_token')

      if (!token) {
        console.error('No token available for user limits fetch')
        return
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/limits/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        setUserLimits(data)
        
        // Track user limits
        if (op) {
          op.track('user_limits_loaded', {
            canAnalyze: data.can_analyze,
            dailyUsed: data.limits.daily_used,
            dailyLimit: data.limits.daily_limit,
            hourlyUsed: data.limits.hourly_used,
            hourlyLimit: data.limits.hourly_limit
          })
        }
        
        // Track if user is rate limited
        if (!data.can_analyze && op) {
          op.track('rate_limit_encountered', {
            reason: data.message,
            dailyUsed: data.limits.daily_used,
            hourlyUsed: data.limits.hourly_used
          })
        }
      } else if (response.status === 401) {
        // Token expired - clear it and redirect to sign in
        localStorage.removeItem('google_token')
        localStorage.removeItem('user_info')
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to fetch user limits:', error)
    }
  }

  const handleTemplateClick = (template: ActivityTemplate) => {
    // Track template selection
    if (op) {
      op.track('template_clicked', {
        templateId: template.id,
        templateName: template.name,
        templateCategory: template.category
      })
    }
    
    onActivitySelected(template)
  }

  const handleCustomSubmit = () => {
    if (customPrompt.trim().length >= 10) {
      // Track custom prompt usage
      if (op) {
        op.track('custom_prompt_submitted', {
          promptLength: customPrompt.length,
          promptPreview: customPrompt.substring(0, 50) + '...'
        })
      }
      
      onActivitySelected(null, customPrompt.trim())
    }
  }

  const handleShowCustomToggle = () => {
    setShowCustom(!showCustom)
    
    // Track custom prompt visibility toggle
    if (op) {
      op.track('custom_prompt_toggled', {
        visible: !showCustom
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-20">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8 pt-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Hi, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-sm text-gray-600">Choose an activity to analyze</p>
        </div>
        <button
          onClick={onSignOut}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign Out
        </button>
      </motion.div>

      {/* Usage Stats */}
      {userLimits && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-4 mb-6 shadow-sm"
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Analyses Today</p>
              <p className="text-2xl font-bold text-blue-600">
                {userLimits.limits.daily_used}/{userLimits.limits.daily_limit}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">This Hour</p>
              <p className="text-lg font-semibold text-gray-800">
                {userLimits.limits.hourly_used}/{userLimits.limits.hourly_limit}
              </p>
            </div>
          </div>
          
          {!userLimits.can_analyze && (
            <div className="mt-3 p-3 bg-orange-50 rounded-lg">
              <p className="text-sm text-orange-700">{userLimits.message}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Custom Prompt Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        {!showCustom ? (
          <button
            onClick={handleShowCustomToggle}
            disabled={!userLimits?.can_analyze}
            className="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <PlusIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Custom Prompt</h3>
                  <p className="text-sm text-gray-600">Describe what you want analyzed</p>
                </div>
              </div>
              <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
          </button>
        ) : (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-white rounded-xl p-4 shadow-sm"
          >
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe what you want analyzed... (e.g., 'Check my golf swing', 'Analyze my dance moves', 'Review my presentation posture')"
              className="w-full h-32 p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-500">
                {customPrompt.length}/500 characters (minimum 10)
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={handleShowCustomToggle}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomSubmit}
                  disabled={customPrompt.trim().length < 10 || !userLimits?.can_analyze}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Quick Templates */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((template, index) => (
            <motion.button
              key={template.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              onClick={() => handleTemplateClick(template)}
              disabled={!userLimits?.can_analyze}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">{template.icon}</span>
                <ArrowRightIcon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
} 