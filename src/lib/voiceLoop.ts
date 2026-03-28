// voiceLoop.ts — hands-free Web Speech API loop
// Rules:
//  • First tap arms the loop; second tap disarms.
//  • Recognition auto-restarts after every final utterance.
//  • Mic is completely locked (no restart) while TTS is playing.

// ─── Public surface ───────────────────────────────────────────────────────────

export type VoiceLoopState = 'disarmed' | 'armed' | 'locked'

export interface VoiceLoopCallbacks {
  onTranscript(text: string, isFinal: boolean): void
  onStateChange(state: VoiceLoopState): void
  onError(message: string): void
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class VoiceLoop {
  private recognition: SpeechRecognition | null = null
  private state: VoiceLoopState = 'disarmed'
  private shouldRestart = false   // gate that onend checks before restarting
  private isRunning = false       // tracks whether recognition.start() is active
  private readonly cb: VoiceLoopCallbacks

  constructor(callbacks: VoiceLoopCallbacks) {
    this.cb = callbacks

    const SR: SpeechRecognitionConstructor | undefined =
      typeof window !== 'undefined'
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : undefined

    if (!SR) {
      callbacks.onError(
        'SpeechRecognition is not supported in this browser. Use Chrome or Edge.',
      )
      return
    }

    const rec = new SR()
    rec.continuous = false      // single utterance per session; we restart manually
    rec.interimResults = true   // stream partial results for live feedback
    rec.maxAlternatives = 1
    rec.lang = 'en-US'

    rec.onstart = () => {
      this.isRunning = true
    }

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1]
      const text = result[0].transcript.trim()
      const isFinal = result.isFinal
      if (text) this.cb.onTranscript(text, isFinal)
    }

    rec.onend = () => {
      this.isRunning = false
      // Auto-restart only when armed and not locked for TTS
      if (this.state === 'armed' && this.shouldRestart) {
        this.startRecognition()
      }
    }

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are expected during normal operation
      if (event.error === 'no-speech' || event.error === 'aborted') return
      this.cb.onError(`SpeechRecognition error: ${event.error}`)
    }

    this.recognition = rec
  }

  // ── Public controls ─────────────────────────────────────────────────────────

  /** First tap: arm the loop and begin listening. */
  arm(): void {
    if (this.state !== 'disarmed') return
    this.state = 'armed'
    this.shouldRestart = true
    this.startRecognition()
    this.cb.onStateChange(this.state)
  }

  /** Second tap: stop the loop entirely. */
  disarm(): void {
    if (this.state === 'disarmed') return
    this.shouldRestart = false
    this.state = 'disarmed'
    this.stopRecognition()
    this.cb.onStateChange(this.state)
  }

  /**
   * Call immediately before any TTS playback begins.
   * Stops recognition and prevents restart until unlockAfterTTS() is called.
   */
  lockForTTS(): void {
    if (this.state !== 'armed') return
    this.shouldRestart = false     // must be set BEFORE stopRecognition()
    this.state = 'locked'
    this.stopRecognition()
    this.cb.onStateChange(this.state)
  }

  /**
   * Call when TTS playback finishes.
   * Resumes the listen loop.
   */
  unlockAfterTTS(): void {
    if (this.state !== 'locked') return
    this.shouldRestart = true
    this.state = 'armed'
    // If onend hasn't fired yet (recognition still winding down), it will
    // restart via the onend handler. If it already fired, start explicitly.
    if (!this.isRunning) {
      this.startRecognition()
    }
    this.cb.onStateChange(this.state)
  }

  /** Switch recognition language between sessions (takes effect on next start). */
  setLanguage(lang: 'en-US' | 'hy-AM'): void {
    if (this.recognition) this.recognition.lang = lang
  }

  /** Clean up on component unmount. */
  destroy(): void {
    this.shouldRestart = false
    this.state = 'disarmed'
    this.stopRecognition()
    this.recognition = null
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private startRecognition(): void {
    if (!this.recognition || this.isRunning) return
    try {
      this.recognition.start()
    } catch {
      // InvalidStateError if already started — safe to ignore
    }
  }

  private stopRecognition(): void {
    if (!this.recognition || !this.isRunning) return
    try {
      this.recognition.stop()
    } catch {
      // safe to ignore
    }
  }
}
