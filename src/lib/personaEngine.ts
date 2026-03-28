// personaEngine.ts — Arpi's four-persona detection and Armenian normalization
//
// Persona 1 — Full Eastern Armenian     : Armenian script detected
// Persona 2 — Armenian-American Hybrid  : English with "jan" / "ara" / "jani"
// Persona 3 — Neutral American English  : default / professional
// Persona 4 — American Shop Casual      : American slang, but ONLY after mechanic
//                                         has already used it first

// ─── Public surface ───────────────────────────────────────────────────────────

export type PersonaId = 1 | 2 | 3 | 4

export interface DetectionResult {
  personaId: PersonaId
  personaName: string
  normalizedText: string   // Armenian part names replaced with English equivalents
  replyStyle: string       // Prompt instruction handed to the LLM in Phase 4
}

// ─── Static tables ────────────────────────────────────────────────────────────

export const PERSONA_NAMES: Record<PersonaId, string> = {
  1: 'Full Armenian',
  2: 'Armenian-American',
  3: 'Professional English',
  4: 'Shop Casual',
}

const REPLY_STYLE: Record<PersonaId, string> = {
  1: 'Respond entirely in Eastern Armenian. Use a formal, respectful register.',
  2: 'Respond in English. Naturally weave in Armenian terms of endearment such as "jan" or "ara". Be warm and conversational.',
  3: 'Respond in professional, neutral American English. Keep answers concise and helpful.',
  4: "Respond in casual American shop English. Match the mechanic's relaxed, familiar energy without being unprofessional.",
}

// Detection patterns —————————————————————————————————————————————————————————

/** Any character in the Armenian Unicode block. */
const ARMENIAN_SCRIPT_RE = /[\u0530-\u058F\uFB13-\uFB17]/

/** Armenian slang terms used inside English sentences. */
const ARMENIAN_SLANG_RE = /\b(jan|jani|ara)\b/i

/** American shop slang that activates Persona 4. */
const AMERICAN_SLANG_RE = /\b(bro|dude|man|whip)\b/i

// Armenian → English parts normalization dictionary ——————————————————————————
// Ordered: longer / more-specific phrases first to avoid partial replacements.

const ARMENIAN_PARTS: ReadonlyArray<[RegExp, string]> = [
  [/օդի\s+ֆիլտր/g, 'air filter'],   // must precede single-word entries
  [/կալոդկա/g,      'brake pads'],
  [/ռոտոր/g,        'rotor'],
  [/մարտկոց/g,      'battery'],
  [/մոմ/g,          'spark plug'],
  [/յուղ/g,         'oil'],
  [/առաջ/g,         'front'],
  [/հետև/g,         'rear'],
]

// ─── Class ────────────────────────────────────────────────────────────────────

export class PersonaEngine {
  /**
   * Tracks whether the mechanic has ever used American slang this session.
   * Persona 4 is only available once this flag is set.
   */
  private mechanicUsedAmericanSlang = false

  /**
   * Analyse a single mechanic utterance.
   * Returns the detected persona, the normalized text, and the LLM reply style.
   */
  detect(transcript: string): DetectionResult {
    const lower = transcript.toLowerCase()
    let personaId: PersonaId

    if (ARMENIAN_SCRIPT_RE.test(transcript)) {
      // Highest priority: any Armenian script → full Armenian persona
      personaId = 1
    } else if (ARMENIAN_SLANG_RE.test(lower)) {
      // Armenian slang embedded in English → hybrid persona
      personaId = 2
    } else if (AMERICAN_SLANG_RE.test(lower)) {
      // Mechanic just initiated casual tone → latch the flag for this session
      this.mechanicUsedAmericanSlang = true
      personaId = 4
    } else if (this.mechanicUsedAmericanSlang) {
      // Mechanic already set casual tone earlier → keep Persona 4 for the session
      personaId = 4
    } else {
      personaId = 3
    }

    return {
      personaId,
      personaName: PERSONA_NAMES[personaId],
      normalizedText: this.normalize(transcript),
      replyStyle: REPLY_STYLE[personaId],
    }
  }

  /** Reset per-session state (call when a new session starts). */
  reset(): void {
    this.mechanicUsedAmericanSlang = false
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private normalize(text: string): string {
    let result = text
    for (const [pattern, replacement] of ARMENIAN_PARTS) {
      result = result.replace(pattern, replacement)
    }
    return result
  }
}
