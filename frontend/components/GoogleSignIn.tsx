'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

declare global {
  interface Window {
    google: any
  }
}

const sportHeadlines = [
  "Perfect Your Pickleball Serve in Seconds",
  "Master Your Basketball Shot Form", 
  "Nail Your Golf Swing Technique",
  "Improve Your Tennis Backhand",
  "Get Your Running Form Right",
  "Fix Your Baseball Swing",
  "Elevate Your Soccer Skills"
]

export default function GoogleSignIn() {
  const [currentHeadline, setCurrentHeadline] = useState(0)

  useEffect(() => {
    // Rotate headlines every 3 seconds
    const interval = setInterval(() => {
      setCurrentHeadline((prev) => (prev + 1) % sportHeadlines.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [])

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
          theme: 'filled_black',
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
          <div className="text-6xl mb-4">🏃‍♂️</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Motion Mentor</h1>
          <p className="text-gray-600">AI coaching from the world's smartest trainers</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          {/* Rotating Headlines */}
          <motion.h2 
            key={currentHeadline}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="text-xl font-semibold text-blue-600 mb-6 h-14 flex items-center justify-center"
          >
            {sportHeadlines[currentHeadline]}
          </motion.h2>
          
          {/* Honest Social Proof */}
          <p className="text-gray-700 mb-6 italic">
            "My wife thinks this is actually useful" - and she's really hard to impress
          </p>
          
          <div className="flex flex-col items-center space-y-2 mb-6 text-sm text-gray-600">
            <div className="flex items-center">
              <span className="text-green-500 mr-2">🎯</span>
              Live coaching feedback
            </div>
            <div className="flex items-center">
              <span className="text-green-500 mr-2">💪</span>
              Expert technique tips
            </div>
            <div className="flex items-center">
              <span className="text-green-500 mr-2">🔒</span>
              Your private training session
            </div>
          </div>

          {/* Problem/Solution Hook */}
          <p className="text-gray-700 text-sm mb-6 font-medium">
            Bad form becomes muscle memory. Fix it before it sticks.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col items-center"
        >
          <div className="mb-3">
            <p className="text-blue-600 font-semibold mb-2">Start Your Coaching Session</p>
            <div id="google-signin-button" className="mb-4"></div>
          </div>
          
          <p className="text-xs text-gray-500 max-w-xs mb-3">
            Videos are processed instantly and never stored. Built this for myself, sharing with you.
          </p>

          <p className="text-xs text-gray-400">
            While it's free (for now) ⚡
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
} 