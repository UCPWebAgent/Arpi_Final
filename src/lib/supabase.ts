// src/lib/supabase.ts — Supabase client + database row types

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://mbjskhclpnwuvprvzovb.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ianNraGNscG53dXZwcnZ6b3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzAzNjEsImV4cCI6MjA5MDI0NjM2MX0.' +
  'ZQyOiwoWrAjwsysI2xsrXuxDKrOx-i2DMSqKjYTMCpE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── Row types (mirror the schema) ───────────────────────────────────────────

export interface DbStore {
  id: string
  name: string
  address: string | null
  created_at: string
}

export interface DbMechanic {
  id: string
  store_id: string
  name: string
  language_preference: 'en' | 'hy' | 'es'
  created_at: string
}

export interface DbSession {
  id: string
  store_id: string
  mechanic_id: string
  created_at: string
  updated_at: string
}

export interface DbMessage {
  id: string
  session_id: string
  store_id: string
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

export interface DbMedia {
  id: string
  session_id: string
  store_id: string
  type: 'photo' | 'video'
  thumbnail: string | null
  mime_type: string | null
  created_at: string
}

export interface DbOrderSummary {
  id: string
  session_id: string
  store_id: string
  vehicle_year: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_engine: string | null
  vehicle_confirmed: boolean
  symptoms: string | null
  urgency: 'Low' | 'Normal' | 'High'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DbPart {
  id: string
  session_id: string
  store_id: string
  name: string
  quantity: number
  confirmed: boolean
  created_at: string
}
