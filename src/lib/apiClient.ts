// src/lib/apiClient.ts
// Typed wrappers around the Cloudflare Worker proxy routes.
// The worker keeps all API keys server-side; the browser only talks to the worker.

const WORKER_URL: string =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ?? 'http://localhost:8787'

// ── Low-level helpers ─────────────────────────────────────────────────────────

async function workerPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

async function workerGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${WORKER_URL}${path}?${qs}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AnthropicResponse {
  content?: Array<{ type: string; text: string }>
  error?: { message: string }
}

// ── /api/claude ───────────────────────────────────────────────────────────────
// Returns Arpi's plain-text reply.

export async function askClaude(
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 300,
): Promise<string> {
  const data = await workerPost<AnthropicResponse>('/api/claude', {
    system,
    messages,
    max_tokens: maxTokens,
  })
  if (data.error) throw new Error(data.error.message)
  const block = data.content?.find(b => b.type === 'text')
  if (!block?.text) throw new Error('Empty response from Claude')
  return block.text
}

// ── /api/elevenlabs ───────────────────────────────────────────────────────────
// Returns the raw audio/mpeg bytes for playback.

export async function textToSpeech(text: string, lang: 'en' | 'hy' = 'en'): Promise<ArrayBuffer> {
  const res = await fetch(`${WORKER_URL}/api/elevenlabs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.arrayBuffer()
}

// ── /api/plate ────────────────────────────────────────────────────────────────

export async function lookupPlate(plate: string, state: string): Promise<unknown> {
  return workerGet('/api/plate', { plate, state })
}

// ── /api/specs ────────────────────────────────────────────────────────────────

export async function lookupVin(vin: string): Promise<unknown> {
  return workerGet('/api/specs', { vin })
}

// ── /api/twilio ───────────────────────────────────────────────────────────────

export async function sendSms(
  to: string,
  message: string,
  mediaUrl?: string,
): Promise<{ sid: string }> {
  return workerPost('/api/twilio', { to, message, ...(mediaUrl ? { mediaUrl } : {}) })
}
