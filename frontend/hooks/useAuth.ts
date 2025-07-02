import { useState, useEffect } from 'react'

interface User {
  id: string
  email: string
  name: string
  given_name: string
  family_name: string
  picture: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing auth on mount
    checkExistingAuth()
    
    // Listen for auth events
    const handleAuthSuccess = () => {
      checkExistingAuth()
    }
    
    window.addEventListener('auth-success', handleAuthSuccess)
    
    return () => {
      window.removeEventListener('auth-success', handleAuthSuccess)
    }
  }, [])

  const checkExistingAuth = () => {
    try {
      const storedToken = localStorage.getItem('google_token')
      const storedUser = localStorage.getItem('user_info')
      
      if (storedToken && storedUser) {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      }
    } catch (error) {
      console.error('Error checking existing auth:', error)
      signOut()
    } finally {
      setLoading(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('google_token')
    localStorage.removeItem('user_info')
    setUser(null)
    setToken(null)
  }

  return {
    user,
    token,
    loading,
    signOut,
  }
} 