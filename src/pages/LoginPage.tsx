// LoginPage.tsx — mechanic email/password login (plain HTML form)

import { useState } from 'react'
import { useAuth } from '../context/authStore'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const err = await login(trimmedEmail, password)
      if (err) {
        console.error('[LoginPage] login error:', err)
        setError(err)
        setBusy(false)
      }
    } catch (ex) {
      console.error('[LoginPage] unexpected error:', ex)
      setError(String(ex))
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 32px',
        width: '100%',
        maxWidth: 360,
        boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🔧</div>
        <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>Arpi</h2>
        <p style={{ margin: '0 0 24px', color: '#888', fontSize: 14 }}>AI Auto Parts Clerk</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="mechanic@store.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={busy}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 12px',
              marginBottom: 12,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 15,
              boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={busy}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 12px',
              marginBottom: 16,
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 15,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{
              display: 'block',
              width: '100%',
              padding: '11px',
              background: busy ? '#aaa' : '#e53935',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {error && (
          <p style={{ marginTop: 16, color: '#e53935', fontSize: 14 }}>{error}</p>
        )}
      </div>
    </div>
  )
}
