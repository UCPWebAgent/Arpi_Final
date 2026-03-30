// arpi-worker/src/index.ts
// Cloudflare Worker — API proxy for Arpi frontend.
// All external API keys live here as Worker secrets; the browser never sees them.

interface Env {
  ANTHROPIC_API_KEY: string
  CARSXE_API_KEY: string
  AZURE_SPEECH_KEY: string
  AZURE_SPEECH_REGION: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID_EN: string
  ELEVENLABS_VOICE_ID_HY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
  PRODUCTION_ORIGIN: string
}

const LOCALHOST_ORIGIN = 'http://localhost:5173'

// ── CORS helpers ──────────────────────────────────────────────────────────────

function getAllowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null
  if (origin === LOCALHOST_ORIGIN) return origin
  if (env.PRODUCTION_ORIGIN && origin === env.PRODUCTION_ORIGIN) return origin
  return null
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonReply(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}

// ── Route: /api/claude ────────────────────────────────────────────────────────
// POST { system, messages, model?, max_tokens? }
// → Anthropic Messages API response (full JSON, client extracts content[0].text)

async function handleClaude(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    model?: string
    max_tokens?: number
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: body.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: body.max_tokens ?? 300,
      system: body.system,
      messages: body.messages,
    }),
  })

  const data = await res.json()
  return jsonReply(data, res.status)
}

// ── Route: /api/plate ─────────────────────────────────────────────────────────
// GET ?plate=ABC123&state=CA
// → CarsXE plate lookup JSON

async function handlePlate(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const plate = url.searchParams.get('plate') ?? ''
  const state = url.searchParams.get('state') ?? ''

  const upstream =
    `https://api.carsxe.com/platelookup` +
    `?key=${env.CARSXE_API_KEY}` +
    `&plate=${encodeURIComponent(plate)}` +
    `&state=${encodeURIComponent(state)}`

  const res = await fetch(upstream)
  const data = await res.json()
  return jsonReply(data, res.status)
}

// ── Route: /api/specs ─────────────────────────────────────────────────────────
// GET ?vin=1HGBH41JXMN109186
// → CarsXE VIN specs JSON

async function handleSpecs(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const vin = url.searchParams.get('vin') ?? ''

  const upstream =
    `https://api.carsxe.com/specs` +
    `?key=${env.CARSXE_API_KEY}` +
    `&vin=${encodeURIComponent(vin)}`

  const res = await fetch(upstream)
  const data = await res.json()
  return jsonReply(data, res.status)
}

// ── Route: /api/azure-speech ──────────────────────────────────────────────────
// POST  body=<raw PCM/WAV audio>  ?lang=en-US
// → Azure STT JSON { RecognitionStatus, DisplayText, ... }

async function handleAzureSpeech(req: Request, env: Env): Promise<Response> {
  const lang = new URL(req.url).searchParams.get('lang') ?? 'en-US'
  const audio = await req.arrayBuffer()

  const endpoint =
    `https://${env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com` +
    `/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(lang)}&format=simple`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
    },
    body: audio,
  })

  const data = await res.json()
  return jsonReply(data, res.status)
}

// ── Route: /api/elevenlabs ────────────────────────────────────────────────────
// POST { text, lang?, modelId? }
// → audio/mpeg binary stream

async function handleElevenLabs(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as {
    text: string
    lang?: 'en' | 'hy'
    modelId?: string
  }

  // Use the Armenian voice id when lang is 'hy', falling back to English voice
  const voiceId =
    body.lang === 'hy' && env.ELEVENLABS_VOICE_ID_HY
      ? env.ELEVENLABS_VOICE_ID_HY
      : env.ELEVENLABS_VOICE_ID_EN

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: body.text,
      model_id: body.modelId ?? 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return jsonReply({ error: err }, res.status)
  }

  // Pipe the audio stream straight through — no buffering needed
  return new Response(res.body, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}

// ── Route: /api/twilio ────────────────────────────────────────────────────────
// POST { to, message, mediaUrl? }
// → { sid } on success

async function handleTwilio(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as {
    to: string
    message: string
    mediaUrl?: string
  }

  const params = new URLSearchParams({
    To: body.to,
    From: env.TWILIO_FROM_NUMBER,
    Body: body.message,
  })
  if (body.mediaUrl) params.set('MediaUrl', body.mediaUrl)

  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)
  const endpoint =
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json()
  return jsonReply(data, res.status)
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = getAllowedOrigin(origin, env)

    if (!allowed) {
      return new Response('Forbidden', { status: 403 })
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowed) })
    }

    const path = new URL(request.url).pathname
    let response: Response

    try {
      switch (path) {
        case '/api/claude':
          response = await handleClaude(request, env)
          break
        case '/api/plate':
          response = await handlePlate(request, env)
          break
        case '/api/specs':
          response = await handleSpecs(request, env)
          break
        case '/api/azure-speech':
          response = await handleAzureSpeech(request, env)
          break
        case '/api/elevenlabs':
          response = await handleElevenLabs(request, env)
          break
        case '/api/twilio':
          response = await handleTwilio(request, env)
          break
        default:
          response = jsonReply({ error: 'Not found' }, 404)
      }
    } catch (err) {
      console.error('[arpi-worker]', err)
      response = jsonReply({ error: 'Internal server error' }, 500)
    }

    // Attach CORS headers to every response
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(corsHeaders(allowed))) {
      headers.set(k, v)
    }
    return new Response(response.body, { status: response.status, headers })
  },
}
