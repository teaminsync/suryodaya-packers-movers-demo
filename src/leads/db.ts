/**
 * Supabase Postgres connection and schema initialization
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "[Database] DATABASE_URL environment variable is required"
  );
}

// Create Postgres client
export const sql = postgres(DATABASE_URL, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Initialize schema (idempotent - safe to run on every startup)
 */
async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      whatsapp_number TEXT NOT NULL,
      contact_name TEXT,
      status TEXT NOT NULL,
      move_type TEXT,
      origin TEXT,
      destination TEXT,
      urgency TEXT,
      has_special_items BOOLEAN NOT NULL DEFAULT FALSE,
      special_items TEXT,
      estimated_volume TEXT,
      requires_packing BOOLEAN NOT NULL DEFAULT FALSE,
      ai_provider_used TEXT,
      ai_was_failover BOOLEAN NOT NULL DEFAULT FALSE,
      raw_enquiry_text TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS processed_messages (
      wamid TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      processed_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS booking_offers (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      slot_options TEXT NOT NULL,
      selected_slot TEXT,
      offered_at TIMESTAMPTZ NOT NULL,
      responded_at TIMESTAMPTZ
    )
  `;

  await sql`
    ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_captures (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      wamid TEXT NOT NULL,
      media_type TEXT NOT NULL,
      storage_path TEXT,
      asset_type TEXT,
      suggested_room_label TEXT,
      items TEXT,
      total_estimated_cubic_feet REAL,
      total_estimated_weight_kg REAL,
      packing_complexity TEXT,
      special_handling_notes TEXT,
      confidence TEXT,
      ai_provider_used TEXT,
      ai_was_failover BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_number ON leads(whatsapp_number)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_booking_offers_lead_id ON booking_offers(lead_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_media_captures_lead_id ON media_captures(lead_id)
  `;

  // Add room_key and room_qualifier columns (idempotent)
  await sql`
    ALTER TABLE media_captures ADD COLUMN IF NOT EXISTS room_key TEXT
  `;

  await sql`
    ALTER TABLE media_captures ADD COLUMN IF NOT EXISTS room_qualifier TEXT
  `;

  // Add escalation columns (idempotent)
  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ
  `;

  // Add messages table and human takeover column
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      wamid TEXT,
      direction TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      message_type TEXT NOT NULL,
      body TEXT,
      media_capture_id TEXT REFERENCES media_captures(id),
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid_unique
    ON messages(wamid) WHERE wamid IS NOT NULL
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN NOT NULL DEFAULT FALSE
  `;

  // New contact management tables
  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      phone_e164 TEXT UNIQUE,
      display_name TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS contact_identities (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      channel TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      UNIQUE (channel, external_id)
    )
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_id TEXT REFERENCES contacts(id)
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ
  `;

  await sql`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_reason TEXT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS touchpoints (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      source TEXT NOT NULL,
      external_ref TEXT,
      raw_payload TEXT,
      received_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      channel TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      wording TEXT,
      evidence_ref TEXT,
      captured_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  await sql`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON leads(contact_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_contact_identities_contact_id ON contact_identities(contact_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_touchpoints_lead_id ON touchpoints(lead_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_touchpoints_contact_id ON touchpoints(contact_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_consents_contact_channel ON consents(contact_id, channel)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_touchpoints_source_ref ON touchpoints(source, external_ref) WHERE external_ref IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS intake_rejects (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      raw_payload TEXT,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;

  // Lock down all tables to server-only access on Supabase (anon/authenticated roles
  // get full table rights by default). Leaves only SELECT on messages for authenticated
  // users, which the dashboard Realtime subscription needs.
  await sql`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE processed_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE booking_offers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE media_captures ENABLE ROW LEVEL SECURITY;
    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contact_identities ENABLE ROW LEVEL SECURITY;
    ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY;
    ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE intake_rejects ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE leads, processed_messages, booking_offers, media_captures, messages, contacts, contact_identities, touchpoints, consents, intake_rejects FROM anon;
    REVOKE ALL ON TABLE leads, processed_messages, booking_offers, media_captures, messages, contacts, contact_identities, touchpoints, consents, intake_rejects FROM authenticated;
    GRANT SELECT ON TABLE messages TO authenticated;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'messages'
        AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
    ) THEN
      CREATE POLICY messages_authenticated_read ON messages FOR SELECT TO authenticated USING (true);
    END IF;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  END IF;
END
$$;
  `;

  console.log("[Database] Schema initialized");
}

/**
 * Test database connectivity
 */
async function testConnection(): Promise<void> {
  try {
    await sql`SELECT 1`;
    console.log("[Database] Connected to Supabase Postgres");
  } catch (error) {
    console.error(
      "[Database] Failed to connect to Supabase Postgres:",
      error
    );
    console.error(
      "[Database] If connection hangs or times out, this is likely an IPv6 issue."
    );
    console.error(
      "[Database] Solution: Use the Session pooler connection string (IPv4-compatible) instead of the Direct connection."
    );
    throw error;
  }
}

/**
 * Initialize database on module load
 */
export async function initializeDatabase(): Promise<void> {
  await testConnection();
  await initSchema();
}
