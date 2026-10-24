/**
 * Backfill Instagram full names and usernames for existing contacts
 * Run with: npx tsx src/backfill-instagram-names.ts [--dry-run]
 */

import "dotenv/config";
import { sql } from "./leads/db.js";
import { instagramClient } from "./instagram/client.js";
import { setInstagramProfileIfMissing } from "./leads/contacts.js";

const isDryRun = process.argv.includes("--dry-run");

interface ContactRow {
  contact_id: string;
  external_id: string;
}

async function main() {
  const contacts = await sql<ContactRow[]>`
    SELECT DISTINCT ci.contact_id, ci.external_id
    FROM contact_identities ci
    JOIN contacts c ON ci.contact_id = c.id
    WHERE ci.channel = 'instagram'
      AND (c.instagram_username IS NULL OR c.instagram_username = '')
    LIMIT 200
  `;

  console.log(`Found ${contacts.length} contacts to process`);

  let scanned = 0;
  let updated = 0;
  let noData = 0;

  for (const row of contacts) {
    scanned++;
    const lastFour = row.external_id.slice(-4);

    const profile = await instagramClient.getProfile(row.external_id);

    if (profile && (profile.name || profile.username)) {
      const hasName = profile.name ? "yes" : "no";
      const hasUsername = profile.username ? "yes" : "no";
      console.log(`...${lastFour} name=${hasName} username=${hasUsername}`);

      if (!isDryRun) {
        await setInstagramProfileIfMissing(row.contact_id, profile);
        updated++;
      }
    } else {
      noData++;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`\nTotals: scanned=${scanned}, updated=${isDryRun ? 0 : updated}, noData=${noData}`);
  if (isDryRun) {
    console.log("Dry run - no updates made");
  }

  await sql.end();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
