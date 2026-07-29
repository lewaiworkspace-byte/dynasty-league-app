'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  return (
    <div className="page">
      <div className="ledger admin-form" style={{ maxWidth: '420px', margin: '4rem auto' }}>
        <h1 className="team-name">Owner Login</h1>

        {status === 'sent' ? (
          <p>
            Check <strong>{email}</strong> for a sign-in link — no password
            needed, just click it and you're in.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <button type="submit" className="btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending link...' : 'Send login link'}
            </button>

            {status === 'error' && <p className="form-error">{errorMessage}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
