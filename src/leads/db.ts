/**
 * SQLite connection and schema initialization using sql.js (pure JS, no native deps)
 */

import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file in project root
const DB_PATH = path.join(__dirname, "..", "..", "suryodaya.db");

let dbInstance: SqlJsDatabase | null = null;

/**
 * Initialize sql.js and load/create database
 */
async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(buffer);
    console.log(`[Database] Loaded existing database from ${DB_PATH}`);
  } else {
    dbInstance = new SQL.Database();
    console.log(`[Database] Created new database at ${DB_PATH}`);
  }

  // Initialize schema
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      whatsapp_number TEXT NOT NULL,
      contact_name TEXT,
      status TEXT NOT NULL,
      move_type TEXT,
      origin TEXT,
      destination TEXT,
      urgency TEXT,
      has_special_items INTEGER DEFAULT 0,
      special_items TEXT,
      estimated_volume TEXT,
      requires_packing INTEGER DEFAULT 0,
      ai_provider_used TEXT,
      ai_was_failover INTEGER DEFAULT 0,
      raw_enquiry_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      wamid TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booking_offers (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      slot_options TEXT NOT NULL,
      selected_slot TEXT,
      offered_at TEXT NOT NULL,
      responded_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_number ON leads(whatsapp_number);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_booking_offers_lead_id ON booking_offers(lead_id);
  `);

  console.log(`[Database] Schema initialized`);

  // Save to disk immediately
  saveDatabase();

  return dbInstance;
}

/**
 * Save database to disk
 */
export function saveDatabase(): void {
  if (dbInstance) {
    const data = dbInstance.export();
    fs.writeFileSync(DB_PATH, data);
  }
}

/**
 * Get database instance (lazy initialization)
 */
let dbPromise: Promise<SqlJsDatabase> | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!dbPromise) {
    dbPromise = initDatabase();
  }

  return dbPromise;
}

// Synchronous wrapper for compatibility (throws if not initialized)
export function getDbSync(): SqlJsDatabase {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call getDb() first.");
  }
  return dbInstance;
}
