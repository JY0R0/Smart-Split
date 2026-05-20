import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import apiClient from '../services/apiClient'

function parseHashFragment(hash) {
  const result = {}
  const normalized = (hash || '').replace(/^#/, '')
  const params = new URLSearchParams(normalized)
  for (const [key, value] of params.entries()) {
    result[key] = value
  }
  return result
}

export default function GoogleAuthCallback() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [message, setMessage] = useState('Completing Google sign-in...')

  useEffect(() => {
    let active = true

    async function completeGoogleLogin() {
      try {
        const hashParams = parseHashFragment(window.location.hash)
        const accessToken = hashParams.access_token

        if (!accessToken) {
          throw new Error('Google did not return an access token.')
        }

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!profileResponse.ok) {
          throw new Error('Unable to read Google profile.')
        }

        const profile = await profileResponse.json()
        const { data: payload } = await apiClient.post('/auth/google/callback', { profile })
        login.__saveSession(payload)

        if (!active) return

        const target = payload?.user?.role === 'admin' ? '/admin' : '/dashboard'
        navigate(target, { replace: true })
      } catch (err) {
        if (!active) return
        setMessage(err?.message || 'Google sign-in failed.')
        navigate('/login', { replace: true, state: { error: err?.message || 'Google sign-in failed.' } })
      }
    }

    completeGoogleLogin()

    return () => {
      active = false
    }
  }, [login, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4 py-12">
      <div className="rounded-3xl border border-slate-200/60 bg-white/90 px-6 py-5 text-sm font-medium text-slate-700 shadow-xl shadow-slate-200/50 backdrop-blur-lg">
        {message}
      </div>
    </div>
  )
}