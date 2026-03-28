import { useRef, useState } from 'react'
import {
  Page,
  Navbar,
  NavLeft,
  NavRight,
  NavTitle,
  Link,
  Button,
  Block,
  Icon,
  Popup,
} from 'framework7-react'
import { useMedia, captureVideoThumbnail, type MediaItem } from '../context/mediaStore'

// ─── Component ────────────────────────────────────────────────────────────────

interface MediaPageProps {
  f7route: { params: { sessionId: string } }
}

export default function MediaPage({ f7route }: MediaPageProps) {
  const { sessionId } = f7route.params
  const { addItem, removeItem, getBySession } = useMedia()

  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fullVideoRef  = useRef<HTMLVideoElement>(null)

  const [selected, setSelected] = useState<MediaItem | null>(null)

  const sessionItems = getBySession(sessionId)

  // ── Capture handlers ───────────────────────────────────────────────────────

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-selected if needed
    e.target.value = ''

    const objectUrl = URL.createObjectURL(file)
    addItem({
      id: crypto.randomUUID(),
      sessionId,
      type: 'photo',
      objectUrl,
      thumbnail: objectUrl,   // photos use the blob URL directly; CSS handles sizing
      mimeType: file.type,
      timestamp: Date.now(),
    })
  }

  const handleVideoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const objectUrl = URL.createObjectURL(file)
    const thumbnail = await captureVideoThumbnail(objectUrl)
    addItem({
      id: crypto.randomUUID(),
      sessionId,
      type: 'video',
      objectUrl,
      thumbnail,
      mimeType: file.type,
      timestamp: Date.now(),
    })
  }

  // ── Full-view helpers ──────────────────────────────────────────────────────

  const openItem = (item: MediaItem) => {
    setSelected(item)
    if (item.type === 'video') {
      // give the Popup time to mount before playing
      setTimeout(() => fullVideoRef.current?.play().catch(() => {}), 300)
    }
  }

  const closePopup = () => {
    fullVideoRef.current?.pause()
    setSelected(null)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page name="media">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <Navbar>
        <NavLeft>
          <Link back iconF7="chevron_left" text="Back" />
        </NavLeft>
        <NavTitle>
          Media
          {sessionItems.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 13, color: '#8e8e93', marginLeft: 6 }}>
              ({sessionItems.length})
            </span>
          )}
        </NavTitle>
        <NavRight>
          <span style={{ fontSize: 11, color: '#8e8e93', marginRight: 12 }}>
            {sessionId.slice(0, 8)}
          </span>
        </NavRight>
      </Navbar>

      {/* ── Hidden file inputs ─────────────────────────────────────────── */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={photoInputRef}
        style={{ display: 'none' }}
        onChange={handlePhotoCapture}
      />
      {/* capture="camcorder" is the legacy value for video; cast to satisfy TS */}
      <input
        type="file"
        accept="video/*"
        capture={"camcorder" as "environment"}
        ref={videoInputRef}
        style={{ display: 'none' }}
        onChange={handleVideoCapture}
      />

      {/* ── Capture buttons ────────────────────────────────────────────── */}
      <Block style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Button
          fill
          large
          style={{ flex: 1 }}
          onClick={() => photoInputRef.current?.click()}
        >
          <Icon f7="camera_fill" style={{ marginRight: 6 }} />
          Photo
        </Button>
        <Button
          fill
          large
          color="gray"
          style={{ flex: 1 }}
          onClick={() => videoInputRef.current?.click()}
        >
          <Icon f7="videocam_fill" style={{ marginRight: 6 }} />
          Video
        </Button>
      </Block>

      {/* ── Gallery or empty state ─────────────────────────────────────── */}
      {sessionItems.length === 0 ? (
        <Block className="text-center" style={{ marginTop: 48, color: '#8e8e93' }}>
          <Icon f7="photo_on_rectangle" size={56} color="gray" />
          <p style={{ marginTop: 12, fontSize: 15 }}>No media yet</p>
          <p style={{ fontSize: 13 }}>Tap Photo or Video above to capture</p>
        </Block>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
            marginTop: 8,
          }}
        >
          {sessionItems.map(item => (
            <GalleryTile
              key={item.id}
              item={item}
              onOpen={openItem}
              onDelete={removeItem}
            />
          ))}
        </div>
      )}

      {/* ── Full-view popup ─────────────────────────────────────────────── */}
      <Popup
        opened={selected !== null}
        onPopupClosed={closePopup}
        swipeToClose
      >
        <Page>
          <Navbar title={selected?.type === 'photo' ? 'Photo' : 'Video'}>
            <NavRight>
              <Link popupClose iconF7="xmark" />
            </NavRight>
          </Navbar>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'calc(100% - 44px)',
              background: '#000',
              overflow: 'hidden',
            }}
          >
            {selected?.type === 'photo' ? (
              <img
                src={selected.objectUrl}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                alt="captured photo"
              />
            ) : selected?.type === 'video' ? (
              <video
                ref={fullVideoRef}
                src={selected.objectUrl}
                controls
                playsInline
                style={{ maxWidth: '100%', maxHeight: '100%' }}
              />
            ) : null}
          </div>
        </Page>
      </Popup>
    </Page>
  )
}

// ─── Gallery tile ─────────────────────────────────────────────────────────────

interface GalleryTileProps {
  item: MediaItem
  onOpen(item: MediaItem): void
  onDelete(id: string): void
}

function GalleryTile({ item, onOpen, onDelete }: GalleryTileProps) {
  return (
    <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#1c1c1e' }}>

      {/* Thumbnail image (or dark background for failed video thumbs) */}
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.type}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#2c2c2e' }} />
      )}

      {/* Play icon overlay for videos */}
      {item.type === 'video' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.28)',
          }}
        >
          <Icon f7="play_circle_fill" size={36} color="white" />
        </div>
      )}

      {/* Tap overlay — open full view (F7 Link for proper touch ripple) */}
      <Link
        onClick={() => onOpen(item)}
        style={{
          position: 'absolute', inset: 0,
          display: 'block',
          WebkitTapHighlightColor: 'rgba(0,0,0,0.18)',
        }}
      />

      {/* Delete button — top-right corner */}
      <Link
        onClick={() => onDelete(item.id)}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 22, height: 22,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon f7="xmark" size={12} color="white" />
      </Link>
    </div>
  )
}
