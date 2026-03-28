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

  const [lang, setLang]           = useState<Lang>('en')
  const [micState, setMicState]   = useState<MicState>('idle')
  const [messages, setMessages]   = useState<ChatMessage[]>([])
  // Interim (partial) transcript shown live while user is speaking
  const [liveText, setLiveText]   = useState('')

  // Engine refs — stable across renders, created once on mount
  const loopRef    = useRef<VoiceLoop | null>(null)
  const personaRef = useRef(new PersonaEngine())
  // Keep lang accessible inside callbacks without re-binding them
  const langRef    = useRef<Lang>('en')

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
        const result = personaRef.current.detect(text)

        // 3. Arpi's Phase-3 stub reply → received bubble
        //    (Phase 4 replaces this text with a real LLM response)
        const arpiStub =
          result.normalizedText !== text
            ? `[${result.personaName}] Understood: "${result.normalizedText}"`
            : `[${result.personaName}] Got it — LLM response wires up in Phase 4.`

        const arpiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          text: arpiStub,
          type: 'received',
          name: 'Arpi',
          personaId: result.personaId,
          first: true,
          last: true,
          tail: true,
        }

        setMessages(prev => [...prev, mechanicMsg, arpiMsg])
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
          <Segmented strong tag="div" style={{ width: 100, marginRight: 8 }}>
            <Button active={lang === 'en'} small onClick={() => handleLangChange('en')}>
              EN
            </Button>
            <Button active={lang === 'hy'} small onClick={() => handleLangChange('hy')}>
              HY
            </Button>
          </Segmented>
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
