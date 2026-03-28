import { App, View } from 'framework7-react'
import Framework7 from 'framework7/lite-bundle'
import Framework7React from 'framework7-react'

import HomePage    from './pages/HomePage'
import VoicePage   from './pages/VoicePage'
import MediaPage   from './pages/MediaPage'
import SummaryPage from './pages/SummaryPage'
import SearchPage  from './pages/SearchPage'
import LoginPage   from './pages/LoginPage'

import { AuthProvider, useAuth } from './context/authStore'
import { MediaProvider }         from './context/mediaStore'
import { OrderProvider }         from './context/orderStore'

Framework7.use(Framework7React)

const routes = [
  { path: '/',                    component: HomePage    },
  { path: '/voice/:sessionId',    component: VoicePage   },
  { path: '/media/:sessionId',    component: MediaPage   },
  { path: '/summary/:sessionId',  component: SummaryPage },
  { path: '/search',              component: SearchPage  },
]

const f7params = {
  name: 'Arpi',
  id: 'com.arpi.autoparts',
  routes,
  theme: 'ios' as const,
}

// ─── AuthGate — renders login or the full app based on auth state ─────────────

function AuthGate() {
  const { mechanic, loading } = useAuth()

  if (loading) {
    // Minimal splash while the initial Supabase session check resolves
    return (
      <div style={{
        height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 48,
      }}>
        🔧
      </div>
    )
  }

  if (!mechanic) {
    return <LoginPage />
  }

  return (
    <OrderProvider>
      <MediaProvider>
        <View main url="/" />
      </MediaProvider>
    </OrderProvider>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ArpiApp() {
  return (
    <App {...f7params}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </App>
  )
}
