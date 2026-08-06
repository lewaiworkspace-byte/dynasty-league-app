'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import { safeNext } from '../../lib/safeNext'

// Six-digit email code, not a magic link, and deliberately with no link
// fallback.
//
// A magic link carries a PKCE code verifier that lives in the browser
// that REQUESTED the link. Request it on a phone, open it in the Gmail
// app's in-app browser, and the verifier is not there -- the result is
// "Email link is invalid or has expired". That failure is confirmed in
// this league: one owner's auth row shows a confirmed email with a null
// last_sign_in_at, which is exactly that shape. The link proved his
// address and never gave him a session.
//
// A code typed back into the page that asked for it has no verifier and
// no second device, so the whole class of failure goes away. There is no
// link fallback on purpose: if the email contains a link, owners will
// click the link and land right back on the wall this change removes.

// Supabase's SMTP settings enforce a minimum interval between sends to
// the same address and answer a second attempt inside it with a 429. The
// countdown exists so an owner sees a timer instead of that error.
const RESEND_COOLDOWN_SECONDS = 60

function describeError(error, isVerifyStep) {
  const status = error && error.status
  const raw = (error && error.message) || 'Something went wrong. Please try again.'
  const lower = raw.toLowerCase()

  if (status === 429 || lower.indexOf('rate limit') !== -1 || lower.indexOf('too many') !== -1) {
    return 'Too many requests. Wait a minute and try again.'
  }

  // Scoped to the verify step on purpose. Step 1 can return its own
  // "invalid" errors (a malformed address, most obviously), and telling
  // someone their code did not work when they have not been given one
  // yet would send them looking for the wrong problem.
  if (isVerifyStep && (lower.indexOf('expired') !== -1 || lower.indexOf('invalid') !== -1)) {
    return "That code didn't work. It may have expired — request a new one."
  }

  return raw
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState('email') // email | code
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode() {
    // shouldCreateUser MUST stay true. Three owners have no auth.users
    // row yet; false would refuse to create one and lock them out for
    // good. No emailRedirectTo -- there is no link in this flow.
    return supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
  }

  async function handleRequestCode(e) {
    e.preventDefault()
    setErrorMessage('')
    setBusy(true)

    const { error } = await sendCode()

    if (error) {
      setErrorMessage(describeError(error, false))
      setBusy(false)
      return
    }

    setCode('')
    setStep('code')
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setBusy(false)
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return
    setErrorMessage('')
    setBusy(true)

    const { error } = await sendCode()

    if (error) {
      setErrorMessage(describeError(error, false))
      setBusy(false)
      return
    }

    setCooldown(RESEND_COOLDOWN_SECONDS)
    setBusy(false)
  }

  async function handleVerify(e) {
    e.preventDefault()
    setErrorMessage('')
    setBusy(true)

    // type MUST be 'email'. 'magiclink' is a different token type and
    // will not verify a code produced by signInWithOtp.
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'email',
    })

    if (error) {
      setErrorMessage(describeError(error, true))
      setBusy(false)
      return
    }

    // Order matters. router.refresh() lets Server Components pick up the
    // new session cookie first; pushing straight to a gated page before
    // that happens gets the owner bounced back here by its own
    // getCurrentTeamOwner() check. busy stays true -- navigation is
    // replacing this page.
    router.refresh()
    router.push(safeNext(searchParams.get('next')))
  }

  function handleDifferentEmail() {
    setStep('email')
    setCode('')
    setErrorMessage('')
  }

  return (
    <div className="page">
      <div className="ledger admin-form" style={{ maxWidth: '420px', margin: '4rem auto' }}>
        <h1 className="team-name">Owner Login</h1>

        {step === 'email' ? (
          <form onSubmit={handleRequestCode}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <button type="submit" className="btn" disabled={busy || email.trim() === ''}>
              {busy ? 'Sending code...' : 'Email me a code'}
            </button>

            {errorMessage && <p className="form-error">{errorMessage}</p>}
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p className="empty-note" style={{ marginTop: 0 }}>
              We emailed a 6-digit code to <strong>{email.trim()}</strong>. Enter it here, on this
              device. If it has not arrived in a minute, check your spam folder.
            </p>

            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="123456"
            />

            <button type="submit" className="btn" disabled={busy || code.length !== 6}>
              {busy ? 'Checking...' : 'Sign in'}
            </button>

            {errorMessage && <p className="form-error">{errorMessage}</p>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                disabled={busy || cooldown > 0}
                onClick={handleResend}
              >
                {cooldown > 0 ? 'Resend code (' + cooldown + 's)' : 'Resend code'}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={handleDifferentEmail}>
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// useSearchParams() de-opts the entire route to client-side rendering in
// Next 14 unless the component calling it sits inside a Suspense
// boundary. Keeping the default export free of it confines that to
// LoginForm.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="ledger admin-form" style={{ maxWidth: '420px', margin: '4rem auto' }}>
            <h1 className="team-name">Owner Login</h1>
            <p className="empty-note" style={{ marginTop: 0 }}>Loading…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
