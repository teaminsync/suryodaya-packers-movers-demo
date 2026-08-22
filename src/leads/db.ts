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
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN NOT NULL DEFAULT FALSE
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
