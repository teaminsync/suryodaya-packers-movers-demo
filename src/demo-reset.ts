/**
 * Demo reset script: clean database and calendar while keeping named test contacts
 * 
 * Usage:
 *   npx tsx src/demo-reset.ts [--keep-phone <digits>]... [--keep-ig <username>]... [--yes]
 * 
 * Default is DRY RUN. Use --yes to execute deletions.
 */

import "dotenv/config";
import { sql, initializeDatabase } from "./leads/db.js";
import { planDemoReset, type DemoResetRow } from "./demo-reset-plan.js";
import { surveyCancelDeps } from "./flows/survey-booking-db.js";

interface Args {
  keepPhones: string[];
  keepInstagramUsernames: string[];
  yes: boolean;
}

function parseArgs(): Args {
  const args: Args = { keepPhones: [], keepInstagramUsernames: [], yes: false };
  const rawArgs = process.argv.slice(2);

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === "--keep-phone" && i + 1 < rawArgs.length) {
      args.keepPhones.push(rawArgs[i + 1]);
      i++;
    } else if (arg === "--keep-ig" && i + 1 < rawArgs.length) {
      args.keepInstagramUsernames.push(rawArgs[i + 1]);
      i++;
    } else if (arg === "--yes") {
      args.yes = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs();

  await initializeDatabase();

  // Get all contacts and leads
  const rows = await sql<DemoResetRow[]>`
    SELECT DISTINCT
      c.id AS "contactId",
      c.phone_e164 AS phone,
      c.instagram_username AS "instagramUsername",
      l.id AS "leadId"
    FROM contacts c
    LEFT JOIN leads l ON c.id = l.contact_id
    WHERE l.id IS NOT NULL
  `;

  const plan = planDemoReset(rows, {
    phones: args.keepPhones,
    instagramUsernames: args.keepInstagramUsernames,
  });

  // Count rows per table that would be deleted
  const keepContactIdsArray = Array.from(plan.keepContactIds);

  const [messagesCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM messages WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [mediaCapturesCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM media_captures WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [bookingOffersCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM booking_offers WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [adminNotificationsCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM admin_notifications WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [touchpointsCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM touchpoints WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [consentsCount] = keepContactIdsArray.length > 0
    ? await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM consents WHERE contact_id != ALL(${keepContactIdsArray})
      `
    : await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM consents
      `;

  const [processedMessagesCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM processed_messages WHERE lead_id = ANY(${plan.deleteLeadIds})
  `;

  const [intakeRejectsCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM intake_rejects
  `;

  const [leadsCount] = await sql<[{ count: number }]>`
    SELECT COUNT(*) AS count FROM leads WHERE id = ANY(${plan.deleteLeadIds})
  `;

  const [contactIdentitiesCount] = keepContactIdsArray.length > 0
    ? await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM contact_identities WHERE contact_id != ALL(${keepContactIdsArray})
      `
    : await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM contact_identities
      `;

  const [contactsCount] = keepContactIdsArray.length > 0
    ? await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM contacts WHERE id != ALL(${keepContactIdsArray})
      `
    : await sql<[{ count: number }]>`
        SELECT COUNT(*) AS count FROM contacts
      `;

  // Get calendar events that would be cancelled
  const calendarEvents = await sql<Array<{ id: string; lead_id: string; calendar_event_id: string; calendar_status: string }>>`
    SELECT id, lead_id, calendar_event_id, calendar_status
    FROM booking_offers
    WHERE lead_id = ANY(${plan.deleteLeadIds})
      AND calendar_status = 'created'
      AND calendar_event_id IS NOT NULL
  `;

  console.log("\n=== DEMO RESET PLAN ===\n");
  console.log(`Keeping ${plan.keepContactIds.size} contact(s)`);
  console.log(`Deleting ${plan.deleteLeadIds.length} lead(s)\n`);

  console.log("Rows that WOULD be deleted:");
  console.log(`  messages:              ${messagesCount.count}`);
  console.log(`  media_captures:        ${mediaCapturesCount.count}`);
  console.log(`  booking_offers:        ${bookingOffersCount.count}`);
  console.log(`  admin_notifications:   ${adminNotificationsCount.count}`);
  console.log(`  touchpoints:           ${touchpointsCount.count}`);
  console.log(`  consents:              ${consentsCount.count}`);
  console.log(`  processed_messages:    ${processedMessagesCount.count}`);
  console.log(`  intake_rejects:        ${intakeRejectsCount.count}`);
  console.log(`  leads:                 ${leadsCount.count}`);
  console.log(`  contact_identities:    ${contactIdentitiesCount.count}`);
  console.log(`  contacts:              ${contactsCount.count}`);

  console.log(`\nCalendar events that WOULD be cancelled: ${calendarEvents.length}`);
  if (calendarEvents.length > 0) {
    for (const evt of calendarEvents) {
      console.log(`  - ${evt.calendar_event_id} (offer ${evt.id}, lead ${evt.lead_id})`);
    }
  }

  if (!args.yes) {
    console.log("\nDRY RUN: No changes made. Use --yes to execute deletions.");
    process.exit(0);
  }

  console.log("\n=== EXECUTING DELETIONS ===\n");

  // Cancel calendar events first
  let cancelledCount = 0;
  let cancelFailedCount = 0;
  for (const evt of calendarEvents) {
    try {
      const result = await surveyCancelDeps.cancelEvent(evt.calendar_event_id);
      if (result.ok) {
        cancelledCount++;
      } else {
        console.warn(`Failed to cancel event ${evt.calendar_event_id}: ${result.error}`);
        cancelFailedCount++;
      }
    } catch (error) {
      console.error(`Error cancelling event ${evt.calendar_event_id}:`, error instanceof Error ? error.message : String(error));
      cancelFailedCount++;
    }
  }

  console.log(`Cancelled ${cancelledCount} calendar event(s), ${cancelFailedCount} failed\n`);

  // Delete in foreign-key-safe order
  await sql`DELETE FROM messages WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${messagesCount.count} message(s)`);

  await sql`DELETE FROM media_captures WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${mediaCapturesCount.count} media_capture(s)`);

  await sql`DELETE FROM booking_offers WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${bookingOffersCount.count} booking_offer(s)`);

  await sql`DELETE FROM admin_notifications WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${adminNotificationsCount.count} admin_notification(s)`);

  await sql`DELETE FROM touchpoints WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${touchpointsCount.count} touchpoint(s)`);

  if (keepContactIdsArray.length > 0) {
    await sql`DELETE FROM consents WHERE contact_id != ALL(${keepContactIdsArray})`;
  } else {
    await sql`DELETE FROM consents`;
  }
  console.log(`Deleted ${consentsCount.count} consent(s)`);

  await sql`DELETE FROM processed_messages WHERE lead_id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${processedMessagesCount.count} processed_message(s)`);

  await sql`DELETE FROM intake_rejects`;
  console.log(`Deleted ${intakeRejectsCount.count} intake_reject(s)`);

  await sql`DELETE FROM leads WHERE id = ANY(${plan.deleteLeadIds})`;
  console.log(`Deleted ${leadsCount.count} lead(s)`);

  if (keepContactIdsArray.length > 0) {
    await sql`DELETE FROM contact_identities WHERE contact_id != ALL(${keepContactIdsArray})`;
  } else {
    await sql`DELETE FROM contact_identities`;
  }
  console.log(`Deleted ${contactIdentitiesCount.count} contact_identity/ies`);

  if (keepContactIdsArray.length > 0) {
    await sql`DELETE FROM contacts WHERE id != ALL(${keepContactIdsArray})`;
  } else {
    await sql`DELETE FROM contacts`;
  }
  console.log(`Deleted ${contactsCount.count} contact(s)`);

  console.log("\n=== DONE ===");
  process.exit(0);
}

main().catch((error) => {
  console.error("Demo reset failed:", error);
  process.exit(1);
});
