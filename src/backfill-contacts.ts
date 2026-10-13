/**
 * Backfill contacts from existing leads
 */

import "dotenv/config";
import { sql, initializeDatabase } from "./leads/db.js";
import { backfillContactsFromLeads } from "./leads/backfill.js";

const dryRun = process.argv.includes("--dry-run");

await initializeDatabase();

const result = await backfillContactsFromLeads({ dryRun });

console.log("\n=== BACKFILL CONTACTS SUMMARY ===");
console.log(`Mode: ${dryRun ? "DRY RUN" : "REAL"}`);
console.log(`\nLeads scanned: ${result.leadsScanned}`);
console.log(`Leads linked: ${result.leadsLinked}`);
console.log(`Contacts created: ${result.contactsCreated}`);
console.log(`Identities created: ${result.identitiesCreated}`);
console.log(`Touchpoints created: ${result.touchpointsCreated}`);

if (result.skipped.length > 0) {
  console.log(`\nSkipped (${result.skipped.length}):`);
  for (const skip of result.skipped) {
    console.log(`  - Lead ${skip.leadId}: ${skip.reason} (tail: ...${skip.numberTail})`);
  }
} else {
  console.log("\nNo leads skipped.");
}

await sql.end();
