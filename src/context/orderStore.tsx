// orderStore.tsx — per-session order state with Supabase persistence
// In-memory store is the source of truth for the UI.
// Every mutation also writes to Supabase asynchronously (fire-and-forget).
// On login the store is hydrated from Supabase; on logout it is cleared.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Urgency = 'Low' | 'Normal' | 'High'

export interface VehicleInfo {
  year: string
  make: string
  model: string
  engine: string
}

export interface PartItem {
  id: string
  name: string
  quantity: number
  confirmed: boolean
}

export interface OrderData {
  sessionId: string
  createdAt: number
  vehicle: Partial<VehicleInfo>
  vehicleConfirmed: boolean
  symptoms: string
  parts: PartItem[]
  urgency: Urgency
  notes: string
}

// ─── isReviewReady — the single source of truth ───────────────────────────────
// RULES (hard):
//  1. Vehicle must be confirmed by the counter clerk.
//  2. Vehicle must have year, make, AND model populated (engine optional).
//  3. At least one part must be individually confirmed.
//  4. Neither condition alone is sufficient — both are required.

export function isReviewReady(order: OrderData): boolean {
  const vehicleOk =
    order.vehicleConfirmed &&
    !!order.vehicle.year?.trim() &&
    !!order.vehicle.make?.trim() &&
    !!order.vehicle.model?.trim()

  const partsOk = order.parts.some(p => p.confirmed)

  return vehicleOk && partsOk   // BOTH required — never just one alone
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blankOrder(sessionId: string): OrderData {
  return {
    sessionId,
    createdAt: Date.now(),
    vehicle: { year: '', make: '', model: '', engine: '' },
    vehicleConfirmed: false,
    symptoms: '',
    parts: [],
    urgency: 'Normal',
    notes: '',
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface OrderContextValue {
  /** All orders across all sessions, in insertion order. */
  allOrders: OrderData[]
  getOrder(sessionId: string): OrderData
  /** Creates the session row in Supabase (no-op if not authenticated). */
  createSession(sessionId: string): Promise<void>
  /** Merge new vehicle fields in. Any update resets vehicleConfirmed. */
  patchVehicle(sessionId: string, patch: Partial<VehicleInfo>): void
  setVehicleField(sessionId: string, field: keyof VehicleInfo, value: string): void
  setVehicleConfirmed(sessionId: string, confirmed: boolean): void
  addPart(sessionId: string, part: Omit<PartItem, 'id'>): void
  updatePart(sessionId: string, partId: string, updates: Partial<Omit<PartItem, 'id'>>): void
  removePart(sessionId: string, partId: string): void
  setSymptoms(sessionId: string, value: string): void
  setUrgency(sessionId: string, value: Urgency): void
  setNotes(sessionId: string, value: string): void
}

const OrderContext = createContext<OrderContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Record<string, OrderData>>({})
  const { mechanic }      = useAuth()

  // Stable ref so Supabase sync callbacks always see the current mechanic
  // without needing to re-create every callback on each render.
  const mechanicRef = useRef(mechanic)
  useEffect(() => { mechanicRef.current = mechanic }, [mechanic])

  // ─── Load from Supabase on login / clear on logout ──────────────────────────
  useEffect(() => {
    if (!mechanic) {
      setStore({})
      return
    }

    const storeId = mechanic.storeId

    supabase
      .from('sessions')
      .select(`
        id,
        created_at,
        order_summary ( vehicle_year, vehicle_make, vehicle_model, vehicle_engine,
                        vehicle_confirmed, symptoms, urgency, notes ),
        parts         ( id, name, quantity, confirmed )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error || !data) return

        const loaded: Record<string, OrderData> = {}
        for (const row of data as any[]) {
          // order_summary is 1:1 (UNIQUE on session_id); PostgREST may return
          // it as an object or a single-element array — handle both.
          const s = Array.isArray(row.order_summary)
            ? row.order_summary[0]
            : row.order_summary

          loaded[row.id] = {
            sessionId:        row.id,
            createdAt:        new Date(row.created_at).getTime(),
            vehicle: {
              year:   s?.vehicle_year   ?? '',
              make:   s?.vehicle_make   ?? '',
              model:  s?.vehicle_model  ?? '',
              engine: s?.vehicle_engine ?? '',
            },
            vehicleConfirmed: s?.vehicle_confirmed ?? false,
            symptoms:         s?.symptoms  ?? '',
            urgency:          (s?.urgency as Urgency) ?? 'Normal',
            notes:            s?.notes ?? '',
            parts: (row.parts ?? []).map((p: any) => ({
              id:        p.id,
              name:      p.name,
              quantity:  p.quantity,
              confirmed: p.confirmed,
            })),
          }
        }
        setStore(loaded)
      })
  }, [mechanic?.storeId])  // re-run only if the store changes (login/logout)

  // ─── Supabase sync helpers ───────────────────────────────────────────────────

  function syncSummary(order: OrderData) {
    const m = mechanicRef.current
    if (!m) return
    supabase.from('order_summary').upsert(
      {
        session_id:        order.sessionId,
        store_id:          m.storeId,
        vehicle_year:      order.vehicle.year   || null,
        vehicle_make:      order.vehicle.make   || null,
        vehicle_model:     order.vehicle.model  || null,
        vehicle_engine:    order.vehicle.engine || null,
        vehicle_confirmed: order.vehicleConfirmed,
        symptoms:          order.symptoms || null,
        urgency:           order.urgency,
        notes:             order.notes    || null,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'session_id' },
    ).then(({ error }) => { if (error) console.error('syncSummary:', error) })
  }

  // ─── Local mutation helper ────────────────────────────────────────────────────

  const mutate = useCallback(
    (sessionId: string, updater: (prev: OrderData) => OrderData) => {
      setStore(prev => ({
        ...prev,
        [sessionId]: updater(prev[sessionId] ?? blankOrder(sessionId)),
      }))
    },
    [],
  )

  // ─── Public API ───────────────────────────────────────────────────────────────

  const allOrders = Object.values(store)

  const getOrder = useCallback(
    (sessionId: string): OrderData => store[sessionId] ?? blankOrder(sessionId),
    [store],
  )

  const createSession = useCallback(async (sessionId: string) => {
    const m = mechanicRef.current
    if (!m) return
    try {
      const { error } = await supabase.from('sessions').insert({
        id:          sessionId,
        store_id:    m.storeId,
        mechanic_id: m.id,
      })
      if (error) console.error('createSession:', error)
    } catch (err) {
      console.error('createSession threw:', err)
    }
  }, [])

  const patchVehicle = useCallback(
    (sessionId: string, patch: Partial<VehicleInfo>) => {
      mutate(sessionId, o => {
        const updated = { ...o, vehicle: { ...o.vehicle, ...patch }, vehicleConfirmed: false }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  const setVehicleField = useCallback(
    (sessionId: string, field: keyof VehicleInfo, value: string) => {
      mutate(sessionId, o => {
        const updated = { ...o, vehicle: { ...o.vehicle, [field]: value }, vehicleConfirmed: false }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  const setVehicleConfirmed = useCallback(
    (sessionId: string, confirmed: boolean) => {
      mutate(sessionId, o => {
        const updated = { ...o, vehicleConfirmed: confirmed }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  const addPart = useCallback(
    (sessionId: string, part: Omit<PartItem, 'id'>) => {
      const id = crypto.randomUUID()
      mutate(sessionId, o => ({ ...o, parts: [...o.parts, { ...part, id }] }))

      const m = mechanicRef.current
      if (m) {
        supabase.from('parts').insert({
          id,
          session_id: sessionId,
          store_id:   m.storeId,
          name:       part.name,
          quantity:   part.quantity,
          confirmed:  part.confirmed,
        }).then(({ error }) => { if (error) console.error('addPart:', error) })
      }
    },
    [mutate],
  )

  const updatePart = useCallback(
    (sessionId: string, partId: string, updates: Partial<Omit<PartItem, 'id'>>) => {
      mutate(sessionId, o => ({
        ...o,
        parts: o.parts.map(p => (p.id === partId ? { ...p, ...updates } : p)),
      }))

      if (mechanicRef.current) {
        supabase.from('parts')
          .update(updates)
          .eq('id', partId)
          .then(({ error }) => { if (error) console.error('updatePart:', error) })
      }
    },
    [mutate],
  )

  const removePart = useCallback(
    (sessionId: string, partId: string) => {
      mutate(sessionId, o => ({ ...o, parts: o.parts.filter(p => p.id !== partId) }))

      if (mechanicRef.current) {
        supabase.from('parts')
          .delete()
          .eq('id', partId)
          .then(({ error }) => { if (error) console.error('removePart:', error) })
      }
    },
    [mutate],
  )

  const setSymptoms = useCallback(
    (sessionId: string, value: string) => {
      mutate(sessionId, o => {
        const updated = { ...o, symptoms: value }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  const setUrgency = useCallback(
    (sessionId: string, value: Urgency) => {
      mutate(sessionId, o => {
        const updated = { ...o, urgency: value }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  const setNotes = useCallback(
    (sessionId: string, value: string) => {
      mutate(sessionId, o => {
        const updated = { ...o, notes: value }
        syncSummary(updated)
        return updated
      })
    },
    [mutate],
  )

  return (
    <OrderContext.Provider
      value={{
        allOrders,
        getOrder, createSession,
        patchVehicle, setVehicleField, setVehicleConfirmed,
        addPart, updatePart, removePart,
        setSymptoms, setUrgency, setNotes,
      }}
    >
      {children}
    </OrderContext.Provider>
  )
}

export function useOrder(): OrderContextValue {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrder must be used inside <OrderProvider>')
  return ctx
}
