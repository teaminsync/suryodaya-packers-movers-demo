/**
 * Query lead data from Supabase Postgres database
 */

import "dotenv/config";
import { sql } from "./leads/db.js";
import type { Lead, BookingOffer } from "./leads/types.js";

const whatsappNumber = process.argv[2];

if (!whatsappNumber) {
  console.error("Usage: npx tsx src/query-lead.ts <whatsapp_number>");
  process.exit(1);
}

console.log(`\n=== Querying lead for WhatsApp number: ${whatsappNumber} ===\n`);

// Get lead
const leads = await sql<Lead[]>`
  SELECT * FROM leads
  WHERE whatsapp_number = ${whatsappNumber}
  ORDER BY created_at DESC
  LIMIT 1
`;

if (leads.length === 0) {
  console.log("No lead found for this number.");
  await sql.end();
  process.exit(0);
}

const lead = leads[0];

console.log("LEAD RECORD:");
console.log(JSON.stringify(lead, null, 2));

// Get booking offer if exists
const offers = await sql<BookingOffer[]>`
  SELECT * FROM booking_offers
  WHERE lead_id = ${lead.id}
  ORDER BY offered_at DESC
  LIMIT 1
`;

if (offers.length > 0) {
  console.log("\n\nBOOKING OFFER:");
  console.log(JSON.stringify(offers[0], null, 2));
}

// Get processed messages for this lead
const messages = await sql`
  SELECT * FROM processed_messages
  WHERE lead_id = ${lead.id}
  ORDER BY processed_at
`;

console.log(`\n\nPROCESSED MESSAGES (${messages.length}):`);
messages.forEach((msg: any) => {
  console.log(`- ${msg.wamid} at ${msg.processed_at}`);
});

// Close connection
await sql.end();
