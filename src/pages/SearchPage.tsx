// SearchPage.tsx — Phase 6: Search and Index
// Searchbar filters across YMME, part names, symptoms, notes, and date.
// Tap a result → navigates to /summary/:sessionId.

import { useState, useMemo } from 'react'
import {
  Page, Navbar, Subnavbar, Searchbar, List, ListItem, Chip, Block, f7,
} from 'framework7-react'
import { useOrder, isReviewReady, type OrderData } from '../context/orderStore'
import { useMedia } from '../context/mediaStore'

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusFor(order: OrderData): { label: string; color: string } {
  if (isReviewReady(order)) return { label: 'Ready', color: 'green' }
  if (order.vehicleConfirmed || order.parts.length > 0) return { label: 'In Progress', color: 'orange' }
  return { label: 'New', color: 'gray' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vehicleLabel(order: OrderData): string {
  const { year, make, model } = order.vehicle
  const tokens = [year, make, model].filter(Boolean)
  return tokens.length ? tokens.join(' ') : '—'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/** Flat lowercase string used for substring matching. */
function searchable(order: OrderData): string {
  return [
    order.sessionId,
    order.vehicle.year,
    order.vehicle.make,
    order.vehicle.model,
    order.vehicle.engine,
    ...order.parts.map(p => p.name),
    order.symptoms,
    order.notes,
    formatDate(order.createdAt),
  ].join(' ').toLowerCase()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const { allOrders } = useOrder()
  const { getBySession } = useMedia()

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? allOrders.filter(o => searchable(o).includes(q))
      : allOrders
    return [...base].sort((a, b) => b.createdAt - a.createdAt)
  }, [allOrders, query])

  return (
    <Page name="search">
      <Navbar title="Orders" backLink="Back">
        <Subnavbar inner={false}>
          <Searchbar
            customSearch
            placeholder="Search by vehicle, part, notes, date…"
            onSearchbarSearch={(_sb: unknown, q: string) => setQuery(q)}
            onSearchbarClear={() => setQuery('')}
            disableButton={false}
          />
        </Subnavbar>
      </Navbar>

      {results.length === 0 ? (
        <Block className="text-center mt-8">
          <div className="text-5xl mb-3" style={{ fontSize: 48 }}>🔍</div>
          <p className="text-gray-400">
            {query ? 'No orders match your search.' : 'No orders yet. Start a voice session.'}
          </p>
        </Block>
      ) : (
        <List mediaList>
          {results.map(order => {
            const { label, color } = statusFor(order)
            const media = getBySession(order.sessionId)
            const thumb = media[0]?.thumbnail ?? ''
            const topPart = order.parts[0]?.name ?? '(no parts yet)'
            const shortId = order.sessionId.slice(0, 8).toUpperCase()
            const dateStr = formatDate(order.createdAt)

            return (
              <ListItem
                key={order.sessionId}
                link
                title={`#${shortId}`}
                subtitle={vehicleLabel(order)}
                text={topPart}
                after={dateStr}
                onClick={() => f7.views.main.router.navigate(`/summary/${order.sessionId}`)}
              >
                {/* Thumbnail or placeholder in media slot */}
                {thumb ? (
                  <img
                    slot="media"
                    src={thumb}
                    alt="media"
                    style={{
                      width: 56, height: 56, borderRadius: 8, objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    slot="media"
                    style={{
                      width: 56, height: 56, borderRadius: 8,
                      background: 'var(--f7-list-item-media-bg-color, #e0e0e0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26,
                    }}
                  >
                    🔧
                  </div>
                )}

                {/* Status chip next to the title */}
                <Chip
                  slot="after-title"
                  text={label}
                  color={color}
                  style={{ marginLeft: 8, fontSize: 11 }}
                />
              </ListItem>
            )
          })}
        </List>
      )}
    </Page>
  )
}
