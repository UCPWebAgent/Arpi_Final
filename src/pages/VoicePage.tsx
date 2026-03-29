import { useState, useEffect, useRef } from 'react'
import {
  Page,
  Navbar,
  NavLeft,
  NavTitle,
  NavRight,
  Link,
  Segmented,
  Button,
  Messages,
  Message,
  MessagesTitle,
  Toolbar,
  Preloader,
  f7,
} from 'framework7-react'
import { VoiceLoop, VoiceLoopState } from '../lib/voiceLoop'
import { PersonaEngine, PERSONA_NAMES, type PersonaId } from '../lib/personaEngine'
import { extractFromTranscript } from '../lib/structuredExtraction'
import { useOrder } from '../context/orderStore'
import { useAuth }  from '../context/authStore'
import { supabase }  from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'hy'
type MicState = 'idle' | 'listening' | 'processing'

interface ChatMessage {
  id: string
  text: string
  type: 'sent' | 'received'
  name?: string
  personaId?: PersonaId   // set on Arpi's received bubbles
  first?: boolean
  last?: boolean
  tail?: boolean
}

// ─── Static content ───────────────────────────────────────────────────────────

const INTRO: Record<Lang, string> = {
  en:
    "Hi, I'm Arpi. I'll help you with your parts today. You can speak to me in Armenian or English—whichever is easier for you. Tap the microphone once and then talk hands-free.",
  hy:
    'Բարև։ Ես Արփին եմ՝ ձեր AI ավտոպահեստամասերի օգնականը։ Ասեք ձեր ավտոմեքենայի տարին, մակնիշը եւ մոդելը, հետո ինչ մաս է ձեզ պետք, եւ ես ձեզ համար ճիշտ մեկը կգտնեմ։',
}

const MIC_LABEL: Record<Lang, Record<MicState, string>> = {
  en: { idle: 'Tap to speak', listening: 'Listening…', processing: 'Processing…' },
  hy: { idle: 'Կտտացրեք', listening: 'Լսում եմ…', processing: 'Մշակում…' },
}

// ─── VoiceLoopState → MicState mapping ───────────────────────────────────────

function toMicState(s: VoiceLoopState): MicState {
  if (s === 'armed')  return 'listening'
  if (s === 'locked') return 'processing'
  return 'idle'
}

// ─── Component ────────────────────────────────────────────────────────────────

interface VoicePageProps {
  f7route: { params: { sessionId: string } }
}

export default function VoicePage({ f7route }: VoicePageProps) {
  const { sessionId } = f7route.params
  const { mechanic }  = useAuth()

  // Initialize language from the mechanic's stored preference (en or hy only)
  const defaultLang: Lang = mechanic?.languagePreference === 'hy' ? 'hy' : 'en'
  const [lang, setLang]           = useState<Lang>(defaultLang)
  const [micState, setMicState]   = useState<MicState>('idle')
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  // Interim (partial) transcript shown live while user is speaking
  const [liveText, setLiveText]   = useState('')

  // Engine refs — stable across renders, created once on mount
  const loopRef    = useRef<VoiceLoop | null>(null)
  const personaRef = useRef(new PersonaEngine())
  // Keep lang accessible inside callbacks without re-binding them
  const langRef    = useRef<Lang>('en')

  // Stable ref so the VoiceLoop closure always sees the current mechanic
  const mechanicRef = useRef(mechanic)
  useEffect(() => { mechanicRef.current = mechanic }, [mechanic])

  // Order store — use a ref so the VoiceLoop closure always sees latest actions
  const orderCtx = useOrder()
  const orderRef = useRef(orderCtx)
  orderRef.current = orderCtx

  // ── Load persisted messages from Supabase on mount ──────────────────────

  useEffect(() => {
    supabase
      .from('messages')
      .select('id, role, text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('messages.load:', error); return }
        if (!data || data.length === 0) return
        setMessages(data.map((row: any) => ({
          id:    row.id,
          text:  row.text,
          type:  row.role === 'user' ? ('sent' as const) : ('received' as const),
          name:  row.role === 'assistant' ? 'Arpi' : undefined,
          first: true,
          last:  true,
          tail:  true,
        })))
      })
  }, [sessionId])

  // ── Sync langRef whenever lang state changes ─────────────────────────────

  useEffect(() => {
    langRef.current = lang
    loopRef.current?.setLanguage(lang === 'en' ? 'en-US' : 'hy-AM')
  }, [lang])

  // ── Boot VoiceLoop on mount, tear down on unmount ────────────────────────

  useEffect(() => {
    const loop = new VoiceLoop({

      onTranscript(text, isFinal) {
        if (!isFinal) {
          // Show partial transcript as live feedback
          setLiveText(text)
          return
        }

        // Final transcript ────────────────────────────────────────────────────
        setLiveText('')

        // 1. Mechanic's utterance → sent bubble
        const mechanicMsg: ChatMessage = {
          id: crypto.randomUUID(),
          text,
          type: 'sent',
          first: true,
          last: true,
          tail: true,
        }

        // 2. Persona detection + Armenian normalization
        const persona = personaRef.current.detect(text)

        // 3. Structured extraction on the normalized text
        const extraction = extractFromTranscript(persona.normalizedText)
        const { patchVehicle, addPart, setSymptoms, getOrder } = orderRef.current

        if (extraction.hasVehicleData) {
          patchVehicle(sessionId, extraction.vehicle)
        }
        for (const p of extraction.parts) {
          addPart(sessionId, { name: p.name, quantity: p.quantity, confirmed: false })
        }
        if (extraction.symptomFragments.length > 0) {
          const existing = getOrder(sessionId).symptoms
          const joined   = extraction.symptomFragments.join(' ')
          setSymptoms(sessionId, existing ? `${existing} ${joined}` : joined)
        }

        // 4. Arpi's acknowledgement bubble (LLM reply wires in Phase 6)
        const extracted: string[] = []
        if (extraction.vehicle.year)  extracted.push(extraction.vehicle.year)
        if (extraction.vehicle.make)  extracted.push(extraction.vehicle.make)
        if (extraction.vehicle.model) extracted.push(extraction.vehicle.model)
        if (extraction.vehicle.engine) extracted.push(extraction.vehicle.engine)
        extraction.parts.forEach(p => extracted.push(`${p.name} ×${p.quantity}`))

        const arpiText = extracted.length > 0
          ? `[${persona.personaName}] Got it — added: ${extracted.join(', ')}`
          : `[${persona.personaName}] Got it — tap the clipboard to review your order.`

        const arpiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          text: arpiText,
          type: 'received',
          name: 'Arpi',
          personaId: persona.personaId,
          first: true,
          last: true,
          tail: true,
        }

        setMessages(prev => [...prev, mechanicMsg, arpiMsg])

        // Persist both messages to Supabase
        const m = mechanicRef.current
        if (m) {
          supabase.from('messages').insert([
            { id: mechanicMsg.id, session_id: sessionId, store_id: m.storeId, role: 'user',      text },
            { id: arpiMsg.id,     session_id: sessionId, store_id: m.storeId, role: 'assistant', text: arpiText },
          ]).then(({ error }) => { if (error) console.error('messages.insert:', error) })
        }
      },

      onStateChange(state: VoiceLoopState) {
        setMicState(toMicState(state))
        // Clear live text when loop stops
        if (state === 'disarmed') setLiveText('')
      },

      onError(message: string) {
        console.error('[VoiceLoop]', message)
        setMicState('idle')
        setLiveText('')
        // Surface the error as an Arpi system message
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: `⚠️ ${message}`,
            type: 'received',
            name: 'Arpi',
            first: true,
            last: true,
            tail: true,
          },
        ])
      },
    })

    loopRef.current = loop
    personaRef.current.reset()

    return () => {
      loop.destroy()
      loopRef.current = null
    }
  }, []) // intentionally empty — run once per mount

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleMic = () => {
    if (micState === 'idle')      loopRef.current?.arm()
    else if (micState === 'listening') loopRef.current?.disarm()
    // 'processing' / locked → tap is ignored (mic locked during TTS)
  }

  const handlePhoto = () => f7.views.main.router.navigate(`/media/${sessionId}`)
  const handleVideo = () => f7.views.main.router.navigate(`/media/${sessionId}`)

  const handleLangChange = (l: Lang) => {
    setLang(l)
    // Reset persona session when language preference changes
    personaRef.current.reset()
  }

  // ── Derived display values ────────────────────────────────────────────────

  const micIcon  = micState === 'idle' ? 'mic' : 'mic_fill'
  const micLabel = liveText
    ? liveText                       // show partial transcript in the button label
    : MIC_LABEL[lang][micState]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page name="voice" messagesContent>

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <Navbar>
        <NavLeft>
          <Link back iconF7="chevron_left" text={lang === 'en' ? 'Back' : 'Հետ'} />
        </NavLeft>

        <NavTitle>Arpi</NavTitle>

        <NavRight>
          <Segmented strong tag="div" style={{ width: 100, marginRight: 6 }}>
            <Button active={lang === 'en'} small onClick={() => handleLangChange('en')}>
              EN
            </Button>
            <Button active={lang === 'hy'} small onClick={() => handleLangChange('hy')}>
              HY
            </Button>
          </Segmented>
          <Link
            iconF7="doc_text"
            iconSize={22}
            style={{ marginRight: 8 }}
            onClick={() => f7.views.main.router.navigate(`/summary/${sessionId}`)}
          />
        </NavRight>
      </Navbar>

      {/* ── Chat area ──────────────────────────────────────────────────── */}
      <Messages>
        <MessagesTitle>
          {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'hy-AM', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </MessagesTitle>

        {/* Arpi's intro — always first, switches with language toggle */}
        <Message
          type="received"
          name="Arpi"
          text={INTRO[lang]}
          first
          last
          tail
        />

        {/* Session messages (sent + Arpi received) */}
        {messages.map(msg => (
          <Message
            key={msg.id}
            type={msg.type}
            name={msg.type === 'received' ? msg.name : undefined}
            text={msg.text}
            first={msg.first}
            last={msg.last}
            tail={msg.tail}
          />
        ))}
      </Messages>

      {/* Persona badge legend (only while session has messages) */}
      {messages.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            padding: '4px 12px',
            background: 'rgba(255,255,255,0.88)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            fontSize: 10,
            color: '#8e8e93',
            zIndex: 10,
          }}
        >
          {([1, 2, 3, 4] as PersonaId[]).map(id => (
            <span key={id}>P{id} {PERSONA_NAMES[id]}</span>
          ))}
        </div>
      )}

      {/* ── Bottom control bar ─────────────────────────────────────────── */}
      <Toolbar bottom tabbar icons>

        {/* Photo */}
        <Link
          iconF7="camera_fill"
          iconSize={26}
          text={lang === 'en' ? 'Photo' : 'Լուսանկար'}
          onClick={handlePhoto}
        />

        {/* Mic — central, larger, full state machine */}
        {micState === 'processing' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            <Preloader size={32} color="red" />
            <span style={{ fontSize: 10, color: '#ef4444' }}>
              {MIC_LABEL[lang].processing}
            </span>
          </div>
        ) : (
          <Link
            iconF7={micIcon}
            iconSize={38}
            iconColor={micState === 'listening' ? 'red' : undefined}
            text={micLabel}
            className={micState === 'listening' ? 'mic-listening' : ''}
            onClick={handleMic}
          />
        )}

        {/* Video */}
        <Link
          iconF7="videocam_fill"
          iconSize={26}
          text={lang === 'en' ? 'Video' : 'Տեսանյութ'}
          onClick={handleVideo}
        />

      </Toolbar>
    </Page>
  )
}
