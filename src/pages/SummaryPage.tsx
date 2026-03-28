import {
  Page, Navbar, NavLeft, NavRight, NavTitle, Link,
  Block, BlockTitle,
  List, ListInput,
  Button, Segmented,
  Stepper, Chip, Icon,
  f7,
} from 'framework7-react'
import { useOrder, isReviewReady, type Urgency, type VehicleInfo } from '../context/orderStore'
import { useMedia } from '../context/mediaStore'

// ─── Component ────────────────────────────────────────────────────────────────

interface SummaryPageProps {
  f7route: { params: { sessionId: string } }
}

export default function SummaryPage({ f7route }: SummaryPageProps) {
  const { sessionId } = f7route.params

  const {
    getOrder, setVehicleField, setVehicleConfirmed,
    addPart, updatePart, removePart,
    setSymptoms, setUrgency, setNotes,
  } = useOrder()

  const { getBySession } = useMedia()

  const order        = getOrder(sessionId)
  const mediaItems   = getBySession(sessionId)
  const ready        = isReviewReady(order)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleVehicleField = (field: keyof VehicleInfo) =>
    (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setVehicleField(sessionId, field, (e.target as HTMLInputElement).value)

  const handleAddPart = () =>
    addPart(sessionId, { name: 'New part', quantity: 1, confirmed: false })

  const handleSend = () => {
    if (!ready) return
    f7.dialog.alert(
      'Your order has been sent to the store counter.\n\nA technician will verify parts availability shortly.',
      'Order Sent ✓',
    )
  }

  // ── Urgency color ─────────────────────────────────────────────────────────
  const urgencyColor: Record<Urgency, string> = {
    Low:    'color-gray',
    Normal: '',
    High:   'color-red',
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page name="summary">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <Navbar>
        <NavLeft>
          <Link back iconF7="chevron_left" text="Back" />
        </NavLeft>
        <NavTitle>Order Summary</NavTitle>
        <NavRight>
          <span style={{ fontSize: 11, color: '#8e8e93', marginRight: 12 }}>
            {sessionId.slice(0, 8)}
          </span>
        </NavRight>
      </Navbar>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Vehicle (YMME)
      ══════════════════════════════════════════════════════════════════ */}
      <BlockTitle>Vehicle (YMME)</BlockTitle>
      <List inset>
        <ListInput
          label="Year"
          type="text"
          inputmode="numeric"
          placeholder="e.g. 2019"
          value={order.vehicle.year ?? ''}
          onInput={handleVehicleField('year')}
          clearButton
        />
        <ListInput
          label="Make"
          type="text"
          placeholder="e.g. Toyota"
          value={order.vehicle.make ?? ''}
          onInput={handleVehicleField('make')}
          clearButton
        />
        <ListInput
          label="Model"
          type="text"
          placeholder="e.g. Camry"
          value={order.vehicle.model ?? ''}
          onInput={handleVehicleField('model')}
          clearButton
        />
        <ListInput
          label="Engine"
          type="text"
          placeholder="e.g. 2.5L · V6 · optional"
          value={order.vehicle.engine ?? ''}
          onInput={handleVehicleField('engine')}
          clearButton
        />
      </List>

      {/* Vehicle confirm / confirmed status */}
      <Block style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -8 }}>
        {order.vehicleConfirmed ? (
          <>
            <Chip
              text="Vehicle Confirmed"
              mediaBgColor="green"
              outline={false}
            >
              <Icon slot="media" f7="checkmark_alt" />
            </Chip>
            <Link
              style={{ fontSize: 13 }}
              onClick={() => setVehicleConfirmed(sessionId, false)}
            >
              Edit
            </Link>
          </>
        ) : (
          <Button
            fill
            small
            color="green"
            disabled={
              !order.vehicle.year?.trim() ||
              !order.vehicle.make?.trim() ||
              !order.vehicle.model?.trim()
            }
            onClick={() => setVehicleConfirmed(sessionId, true)}
          >
            <Icon f7="checkmark_alt" style={{ marginRight: 4 }} />
            Confirm Vehicle
          </Button>
        )}
      </Block>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Symptoms
      ══════════════════════════════════════════════════════════════════ */}
      <BlockTitle>Symptoms</BlockTitle>
      <List inset>
        <ListInput
          type="textarea"
          placeholder="Describe what the mechanic reported (noise, vibration, warning lights…)"
          value={order.symptoms}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) =>
            setSymptoms(sessionId, (e.target as HTMLTextAreaElement).value)
          }
          resizable
        />
      </List>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — Parts list
      ══════════════════════════════════════════════════════════════════ */}
      <BlockTitle
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>Parts</span>
        <Button small onClick={handleAddPart} style={{ fontSize: 13 }}>
          + Add Part
        </Button>
      </BlockTitle>

      {order.parts.length === 0 ? (
        <Block style={{ color: '#8e8e93', fontSize: 14 }}>
          No parts yet — speak to Arpi or tap Add Part.
        </Block>
      ) : (
        <List inset>
          {order.parts.map(part => (
            <li key={part.id} className="item-content" style={{ padding: '10px 16px' }}>
              <div style={{ flex: 1 }}>
                {/* Part name — editable */}
                <input
                  value={part.name}
                  onChange={e => updatePart(sessionId, part.id, { name: e.target.value })}
                  style={{
                    width: '100%',
                    fontSize: 15,
                    border: 'none',
                    borderBottom: '1px solid #e0e0e0',
                    outline: 'none',
                    paddingBottom: 2,
                    marginBottom: 8,
                    background: 'transparent',
                  }}
                />
                {/* Controls row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Qty stepper */}
                  <Stepper
                    value={part.quantity}
                    min={1}
                    max={99}
                    small
                    fill
                    onStepperChange={(v: number) =>
                      updatePart(sessionId, part.id, { quantity: v })
                    }
                  />

                  {/* Confirm toggle */}
                  <Button
                    small
                    fill={part.confirmed}
                    outline={!part.confirmed}
                    color="green"
                    onClick={() =>
                      updatePart(sessionId, part.id, { confirmed: !part.confirmed })
                    }
                    style={{ minWidth: 80 }}
                  >
                    {part.confirmed ? '✓ OK' : 'Confirm'}
                  </Button>

                  {/* Delete */}
                  <Link
                    color="red"
                    onClick={() => removePart(sessionId, part.id)}
                  >
                    <Icon f7="trash" size={18} />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </List>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — Urgency
      ══════════════════════════════════════════════════════════════════ */}
      <BlockTitle>Urgency</BlockTitle>
      <Block>
        <Segmented strong tag="div">
          {(['Low', 'Normal', 'High'] as Urgency[]).map(u => (
            <Button
              key={u}
              active={order.urgency === u}
              color={order.urgency === u && u === 'High' ? 'red' : undefined}
              className={urgencyColor[u]}
              onClick={() => setUrgency(sessionId, u)}
            >
              {u}
            </Button>
          ))}
        </Segmented>
      </Block>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — Notes
      ══════════════════════════════════════════════════════════════════ */}
      <BlockTitle>Notes</BlockTitle>
      <List inset>
        <ListInput
          type="textarea"
          placeholder="Any additional notes for the parts counter…"
          value={order.notes}
          onInput={(e: React.FormEvent<HTMLTextAreaElement>) =>
            setNotes(sessionId, (e.target as HTMLTextAreaElement).value)
          }
          resizable
        />
      </List>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — Attached media thumbnails
      ══════════════════════════════════════════════════════════════════ */}
      {mediaItems.length > 0 && (
        <>
          <BlockTitle>Attached Media ({mediaItems.length})</BlockTitle>
          <Block>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {mediaItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#1c1c1e',
                  }}
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      alt={item.type}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#2c2c2e' }} />
                  )}
                  {item.type === 'video' && (
                    <div
                      style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.30)',
                      }}
                    >
                      <Icon f7="play_circle_fill" size={24} color="white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Block>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — Ready indicator + Send button
      ══════════════════════════════════════════════════════════════════ */}
      <Block>
        {/* isReviewReady status chip */}
        <div style={{ marginBottom: 16 }}>
          {ready ? (
            <Chip text="Ready to send" mediaBgColor="green" outline={false}>
              <Icon slot="media" f7="checkmark_circle_fill" />
            </Chip>
          ) : (
            <Chip text="Vehicle + at least one confirmed part required" mediaBgColor="gray" outline>
              <Icon slot="media" f7="info_circle" />
            </Chip>
          )}
        </div>

        {/* Send to Store */}
        <Button
          fill
          large
          color="red"
          disabled={!ready}
          onClick={handleSend}
        >
          <Icon f7="paperplane_fill" style={{ marginRight: 8 }} />
          Send to Store
        </Button>
      </Block>

      {/* Bottom spacer */}
      <Block style={{ height: 32 }} />
    </Page>
  )
}
