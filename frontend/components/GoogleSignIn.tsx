'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

declare global {
  interface Window {
    google: any
  }
}

export default function GoogleSignIn() {
  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_prompt: false,
      })

      window.google?.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 280,
        }
      )
    }

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  const handleCredentialResponse = async (response: any) => {
    try {
      // Store the token and user info
      const token = response.credential
      localStorage.setItem('google_token', token)
      
      // Decode the JWT to get user info (basic decoding, not verification)
      const payload = JSON.parse(atob(token.split('.')[1]))
      const userInfo = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
      }
      
      localStorage.setItem('user_info', JSON.stringify(userInfo))
      
      // Trigger a custom event to notify other components
      window.dispatchEvent(new CustomEvent('auth-success'))
      
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="mb-8"
        >
          <div className="text-6xl mb-4">👁️</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gemini Eyes</h1>
          <p className="text-gray-600">AI-Powered Activity Analysis</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <p className="text-gray-700 mb-6">
            Get instant AI feedback on any activity - sports, fitness, cooking, and more
          </p>
          
          <div className="flex items-center justify-center space-x-4 mb-6 text-sm text-gray-500">
            <div className="flex items-center">
              <span className="text-green-500 mr-1">✓</span>
              Real-time analysis
            </div>
            <div className="flex items-center">
              <span className="text-green-500 mr-1">✓</span>
              Expert feedback
            </div>
            <div className="flex items-center">
              <span className="text-green-500 mr-1">✓</span>
              Privacy first
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center"
        >
          <div id="google-signin-button" className="mb-4"></div>
          
          <p className="text-xs text-gray-500 max-w-xs">
            Sign in to prevent spam and ensure quality AI analysis for everyone. 
            Your videos are processed once and never stored.
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
} 