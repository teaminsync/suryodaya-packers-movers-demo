/**
 * Simulate delivery failure for testing
 */

import "dotenv/config";
import { recordFailedDeliveries } from "./whatsapp/delivery-db.js";
import type { FailedDelivery } from "./whatsapp/delivery.js";
import { sql } from "./leads/db.js";

const args = process.argv.slice(2);

if (args.includes("--clear")) {
  console.log("[Delivery Simulate] Clearing simulated failures...");
  const result = await sql<{ count: number }[]>`
    DELETE FROM delivery_events
    WHERE wamid LIKE 'wamid.SIMULATED-%'
    RETURNING wamid
  `;
  console.log(`[Delivery Simulate] Deleted ${result.length} simulated failure(s)`);
  process.exit(0);
}

const recipientDigits = args[0];

if (!recipientDigits || !/^\d+$/.test(recipientDigits)) {
  console.error("Usage: npx tsx src/delivery-simulate.ts <recipient-digits>");
  console.error("   or: npx tsx src/delivery-simulate.ts --clear");
  process.exit(1);
}

const timestamp = Date.now();
const failure: FailedDelivery = {
  wamid: `wamid.SIMULATED-${timestamp}`,
  recipient: recipientDigits,
  code: "131047",
  title: "Re-engagement message",
  detail: "Simulated failure for testing",
  failedAt: new Date(),
};

console.log("[Delivery Simulate] Inserting simulated failure:", {
  wamid: failure.wamid,
  recipient: failure.recipient,
  code: failure.code,
});

const inserted = await recordFailedDeliveries([failure]);

console.log(`[Delivery Simulate] Inserted ${inserted} failure record(s)`);
