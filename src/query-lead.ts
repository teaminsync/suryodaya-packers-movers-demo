/**
 * Query lead data from database
 */

import "dotenv/config";
import { getDb } from "./leads/db.js";

const whatsappNumber = process.argv[2];

if (!whatsappNumber) {
  console.error("Usage: npx tsx src/query-lead.ts <whatsapp_number>");
  process.exit(1);
}

const db = await getDb();

console.log(`\n=== Querying lead for WhatsApp number: ${whatsappNumber} ===\n`);

// Get lead
const leadResult = db.exec(
  "SELECT * FROM leads WHERE whatsapp_number = ? ORDER BY created_at DESC LIMIT 1",
  [whatsappNumber]
);

if (leadResult.length === 0 || leadResult[0].values.length === 0) {
  console.log("No lead found for this number.");
  process.exit(0);
}

const leadRow = leadResult[0];
const lead: any = {};
leadRow.columns.forEach((col: string, idx: number) => {
  lead[col] = leadRow.values[0][idx];
});

console.log("LEAD RECORD:");
console.log(JSON.stringify(lead, null, 2));

// Get booking offer if exists
const offerResult = db.exec(
  "SELECT * FROM booking_offers WHERE lead_id = ? ORDER BY offered_at DESC LIMIT 1",
  [lead.id]
);

if (offerResult.length > 0 && offerResult[0].values.length > 0) {
  const offerRow = offerResult[0];
  const offer: any = {};
  offerRow.columns.forEach((col: string, idx: number) => {
    offer[col] = offerRow.values[0][idx];
  });

  console.log("\n\nBOOKING OFFER:");
  console.log(JSON.stringify(offer, null, 2));
}

// Get processed messages for this lead
const msgResult = db.exec(
  "SELECT * FROM processed_messages WHERE lead_id = ? ORDER BY processed_at",
  [lead.id]
);

const messages: any[] = [];
if (msgResult.length > 0) {
  msgResult[0].values.forEach((row: any) => {
    const msg: any = {};
    msgResult[0].columns.forEach((col: string, idx: number) => {
      msg[col] = row[idx];
    });
    messages.push(msg);
  });
}

console.log(`\n\nPROCESSED MESSAGES (${messages.length}):`);
messages.forEach((msg) => {
  console.log(`- ${msg.wamid} at ${msg.processed_at}`);
});
