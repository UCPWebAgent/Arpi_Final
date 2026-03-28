import { App, View } from 'framework7-react'
import Framework7 from 'framework7/lite-bundle'
import Framework7React from 'framework7-react'

import HomePage from './pages/HomePage'
import VoicePage from './pages/VoicePage'
import MediaPage from './pages/MediaPage'
import SummaryPage from './pages/SummaryPage'
import SearchPage from './pages/SearchPage'
import { MediaProvider } from './context/mediaStore'
import { OrderProvider } from './context/orderStore'

Framework7.use(Framework7React)

const routes = [
  { path: '/', component: HomePage },
  { path: '/voice/:sessionId', component: VoicePage },
  { path: '/media/:sessionId', component: MediaPage },
  { path: '/summary/:sessionId', component: SummaryPage },
  { path: '/search', component: SearchPage },
]

const f7params = {
  name: 'Arpi',
  id: 'com.arpi.autoparts',
  routes,
  theme: 'ios' as const,
}

export default function ArpiApp() {
  return (
    <App {...f7params}>
      <OrderProvider>
        <MediaProvider>
          <View main url="/" />
        </MediaProvider>
      </OrderProvider>
    </App>
  )
}
