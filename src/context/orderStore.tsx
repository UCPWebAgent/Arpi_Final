// orderStore.tsx — per-session order state
// Holds YMME, symptoms, parts, urgency, and notes for each voice session.
// isReviewReady() is the canonical gate: both vehicle confirmed AND ≥1 part confirmed.

import { createContext, useCallback, useContext, useState } from 'react'

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

  const mutate = useCallback(
    (sessionId: string, updater: (prev: OrderData) => OrderData) => {
      setStore(prev => ({
        ...prev,
        [sessionId]: updater(prev[sessionId] ?? blankOrder(sessionId)),
      }))
    },
    [],
  )

  const getOrder = useCallback(
    (sessionId: string): OrderData => store[sessionId] ?? blankOrder(sessionId),
    [store],
  )

  const patchVehicle = useCallback(
    (sessionId: string, patch: Partial<VehicleInfo>) => {
      mutate(sessionId, o => ({
        ...o,
        vehicle: { ...o.vehicle, ...patch },
        // Any new extraction from speech resets the clerk's confirmation
        vehicleConfirmed: false,
      }))
    },
    [mutate],
  )

  const setVehicleField = useCallback(
    (sessionId: string, field: keyof VehicleInfo, value: string) => {
      mutate(sessionId, o => ({
        ...o,
        vehicle: { ...o.vehicle, [field]: value },
        vehicleConfirmed: false,
      }))
    },
    [mutate],
  )

  const setVehicleConfirmed = useCallback(
    (sessionId: string, confirmed: boolean) =>
      mutate(sessionId, o => ({ ...o, vehicleConfirmed: confirmed })),
    [mutate],
  )

  const addPart = useCallback(
    (sessionId: string, part: Omit<PartItem, 'id'>) =>
      mutate(sessionId, o => ({
        ...o,
        parts: [...o.parts, { ...part, id: crypto.randomUUID() }],
      })),
    [mutate],
  )

  const updatePart = useCallback(
    (sessionId: string, partId: string, updates: Partial<Omit<PartItem, 'id'>>) =>
      mutate(sessionId, o => ({
        ...o,
        parts: o.parts.map(p => (p.id === partId ? { ...p, ...updates } : p)),
      })),
    [mutate],
  )

  const removePart = useCallback(
    (sessionId: string, partId: string) =>
      mutate(sessionId, o => ({ ...o, parts: o.parts.filter(p => p.id !== partId) })),
    [mutate],
  )

  const setSymptoms = useCallback(
    (sessionId: string, value: string) =>
      mutate(sessionId, o => ({ ...o, symptoms: value })),
    [mutate],
  )

  const setUrgency = useCallback(
    (sessionId: string, value: Urgency) =>
      mutate(sessionId, o => ({ ...o, urgency: value })),
    [mutate],
  )

  const setNotes = useCallback(
    (sessionId: string, value: string) =>
      mutate(sessionId, o => ({ ...o, notes: value })),
    [mutate],
  )

  const allOrders = Object.values(store)

  return (
    <OrderContext.Provider
      value={{
        allOrders,
        getOrder, patchVehicle, setVehicleField, setVehicleConfirmed,
        addPart, updatePart, removePart, setSymptoms, setUrgency, setNotes,
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
