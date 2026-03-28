-- ============================================================
-- Arpi — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor).
-- ============================================================

-- ─── Stores ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- ─── Mechanics ───────────────────────────────────────────────────────────────
-- id must match the corresponding auth.users row (same UUID).
CREATE TABLE IF NOT EXISTS mechanics (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id            uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                text NOT NULL,
  language_preference text NOT NULL DEFAULT 'en'
                      CHECK (language_preference IN ('en','hy','es')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mechanics ENABLE ROW LEVEL SECURITY;

-- ─── Helper: current mechanic's store_id ─────────────────────────────────────
-- Used in all RLS policies below. SECURITY DEFINER so it can read mechanics
-- without triggering an infinite RLS loop.
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT store_id FROM mechanics WHERE id = auth.uid()
$$;

-- ─── Sessions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  mechanic_id uuid NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- ─── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant')),
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ─── Media ───────────────────────────────────────────────────────────────────
-- thumbnail stores the base64 data URL captured at capture time.
-- Object URLs are ephemeral (device-local) and are NOT stored.
CREATE TABLE IF NOT EXISTS media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('photo','video')),
  thumbnail  text,      -- base64 data URL; null if capture failed
  mime_type  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media ENABLE ROW LEVEL SECURITY;

-- ─── Order Summary ───────────────────────────────────────────────────────────
-- One row per session (UNIQUE on session_id). Use UPSERT with onConflict.
CREATE TABLE IF NOT EXISTS order_summary (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  store_id          uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vehicle_year      text,
  vehicle_make      text,
  vehicle_model     text,
  vehicle_engine    text,
  vehicle_confirmed boolean NOT NULL DEFAULT false,
  symptoms          text,
  urgency           text NOT NULL DEFAULT 'Normal'
                    CHECK (urgency IN ('Low','Normal','High')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_summary ENABLE ROW LEVEL SECURITY;

-- ─── Parts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   int  NOT NULL DEFAULT 1,
  confirmed  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- stores: mechanic can read the store they belong to
CREATE POLICY "mechanic reads own store" ON stores
  FOR SELECT USING (id = get_my_store_id());

-- mechanics: each mechanic can read only their own profile
CREATE POLICY "mechanic reads own profile" ON mechanics
  FOR SELECT USING (id = auth.uid());

-- All remaining tables: full CRUD limited to matching store_id
CREATE POLICY "store isolation" ON sessions
  FOR ALL USING (store_id = get_my_store_id());

CREATE POLICY "store isolation" ON messages
  FOR ALL USING (store_id = get_my_store_id());

CREATE POLICY "store isolation" ON media
  FOR ALL USING (store_id = get_my_store_id());

CREATE POLICY "store isolation" ON order_summary
  FOR ALL USING (store_id = get_my_store_id());

CREATE POLICY "store isolation" ON parts
  FOR ALL USING (store_id = get_my_store_id());

-- ============================================================
-- Seed instructions (run manually after schema is created)
-- ============================================================
--
-- Step 1: Insert a store
--   INSERT INTO stores (name, address)
--   VALUES ('Main Street Auto Parts', '123 Main St');
--
-- Step 2: Create a mechanic auth user in the Supabase dashboard
--   Dashboard → Authentication → Users → "Add user"
--   Note the generated user UUID.
--
-- Step 3: Insert the mechanic row
--   INSERT INTO mechanics (id, store_id, name, language_preference)
--   VALUES (
--     '<auth-user-uuid>',
--     '<store-uuid-from-step-1>',
--     'Demo Mechanic',
--     'en'
--   );
