// mediaStore.tsx — session-scoped media context with Supabase persistence
// Object URLs (blob://…) are device-local and are NOT stored in Supabase.
// Only the thumbnail data URL + metadata is persisted so SearchPage can show
// thumbnails for orders loaded from a previous session.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaType = 'photo' | 'video'

export interface MediaItem {
  id: string
  sessionId: string
  type: MediaType
  objectUrl: string   // blob URL of the original file (device-local, ephemeral)
  thumbnail: string   // same as objectUrl for photos; dataURL for videos
  mimeType: string
  timestamp: number
}

interface MediaContextValue {
  /** All items across all sessions. */
  items: MediaItem[]
  /** Add a fully-constructed item (id + timestamp already set by callers). */
  addItem(item: MediaItem): void
  /** Remove an item and revoke its object URL. */
  removeItem(id: string): void
  /** Items belonging to one session, newest-first. */
  getBySession(sessionId: string): MediaItem[]
}

// ─── Context ─────────────────────────────────────────────────────────────────

const MediaContext = createContext<MediaContextValue | null>(null)

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const ownUrls           = useRef<Set<string>>(new Set())
  const { mechanic }      = useAuth()

  // Stable ref so addItem callback always sees the current mechanic
  const mechanicRef = useRef(mechanic)
  useEffect(() => { mechanicRef.current = mechanic }, [mechanic])

  // Clear local items on logout
  useEffect(() => {
    if (!mechanic) setItems([])
  }, [mechanic])

  const addItem = useCallback((item: MediaItem) => {
    ownUrls.current.add(item.objectUrl)
    setItems(prev => [...prev, item])

    const m = mechanicRef.current
    if (m) {
      supabase.from('media').insert({
        id:         item.id,
        session_id: item.sessionId,
        store_id:   m.storeId,
        type:       item.type,
        thumbnail:  item.thumbnail || null,
        mime_type:  item.mimeType  || null,
      }).then(({ error }) => { if (error) console.error('media.insert:', error) })
    }
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id)
      if (item && ownUrls.current.has(item.objectUrl)) {
        URL.revokeObjectURL(item.objectUrl)
        ownUrls.current.delete(item.objectUrl)
      }
      return prev.filter(i => i.id !== id)
    })

    if (mechanicRef.current) {
      supabase.from('media')
        .delete()
        .eq('id', id)
        .then(({ error }) => { if (error) console.error('media.delete:', error) })
    }
  }, [])

  const getBySession = useCallback(
    (sessionId: string) =>
      items
        .filter(i => i.sessionId === sessionId)
        .sort((a, b) => b.timestamp - a.timestamp),
    [items],
  )

  return (
    <MediaContext.Provider value={{ items, addItem, removeItem, getBySession }}>
      {children}
    </MediaContext.Provider>
  )
}

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext)
  if (!ctx) throw new Error('useMedia must be used inside <MediaProvider>')
  return ctx
}

// ─── Video thumbnail helper ───────────────────────────────────────────────────

/**
 * Seeks to 0.5 s into a video blob URL and captures that frame as a JPEG
 * dataURL. Resolves to an empty string on any failure (the tile still renders
 * with the play-icon overlay on a neutral background).
 */
export function captureVideoThumbnail(videoUrl: string): Promise<string> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = videoUrl

    // Fallback: give up after 6 s to avoid hanging on restrictive browsers
    const bail = setTimeout(() => resolve(''), 6000)

    const draw = () => {
      clearTimeout(bail)
      const w = video.videoWidth  || 320
      const h = video.videoHeight || 240
      const canvas = document.createElement('canvas')
      canvas.width  = Math.min(w, 640)
      canvas.height = Math.min(h, 480)
      try {
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        resolve('')
      }
    }

    video.addEventListener('loadeddata', () => {
      if (video.duration > 0.5) {
        video.currentTime = 0.5
        video.addEventListener('seeked', draw, { once: true })
      } else {
        draw()
      }
    }, { once: true })

    video.addEventListener('error', () => { clearTimeout(bail); resolve('') }, { once: true })
    video.load()
  })
}
