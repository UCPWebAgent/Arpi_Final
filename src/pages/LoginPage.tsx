// LoginPage.tsx — mechanic email/password login
// Rendered by AuthGate when no authenticated session exists.

import { useState } from 'react'
import {
  Page,
  Navbar,
  List,
  ListInput,
  ListButton,
  BlockFooter,
  Block,
} from 'framework7-react'
import { useAuth } from '../context/authStore'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  const handleLogin = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await login(trimmedEmail, password)
    if (err) {
      setError(err)
      setBusy(false)
    }
    // On success, AuthProvider updates mechanic → AuthGate re-renders the app.
    // No explicit navigation needed.
  }

  return (
    <Page name="login">
      <Navbar title="Arpi" subtitle="AI Auto Parts Clerk" />

      <Block className="text-center mt-6 mb-2">
        <div style={{ fontSize: 56 }}>🔧</div>
      </Block>

      <List form inset>
        <ListInput
          label="Email"
          type="email"
          placeholder="mechanic@store.com"
          value={email}
          onInput={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          clearButton
        />
        <ListInput
          label="Password"
          type="password"
          placeholder="Password"
          value={password}
          onInput={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        />
        <ListButton
          title={busy ? 'Signing in…' : 'Sign In'}
          color="red"
          onClick={busy ? undefined : handleLogin}
        />
      </List>

      {error && (
        <BlockFooter>
          <span style={{ color: 'var(--f7-color-red)' }}>{error}</span>
        </BlockFooter>
      )}
    </Page>
  )
}
