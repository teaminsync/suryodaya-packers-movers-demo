/**
 * Auto-close lifecycle jobs database wiring
 */

import { sql } from "../leads/db.js";
import { parseAutocloseConfig } from "./autoclose.js";

export async function closeFinishedLeads(hours: number): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    UPDATE leads
    SET closed_at = now()
    WHERE closed_at IS NULL
      AND status = 'booked'
      AND (
        SELECT bo.survey_starts_at
        FROM booking_offers bo
        WHERE bo.lead_id = leads.id
          AND bo.selected_slot IS NOT NULL
          AND bo.survey_starts_at IS NOT NULL
          AND bo.calendar_status IS DISTINCT FROM 'cancelled'
        ORDER BY bo.responded_at DESC NULLS LAST, bo.id DESC
        LIMIT 1
      ) <= now() - make_interval(hours => ${hours})
      AND NOT EXISTS (
        SELECT 1
        FROM messages m
        WHERE m.lead_id = leads.id
          AND m.direction = 'inbound'
          AND m.created_at > now() - make_interval(hours => ${hours})
      )
    RETURNING id
  `;

  return rows.map((r) => r.id);
}

export function startLifecycleJobs(): void {
  const { hours, warnings } = parseAutocloseConfig(process.env);

  for (const warning of warnings) {
    console.warn("[Lifecycle]", warning);
  }

  if (hours === 0) {
    console.log("[Lifecycle] auto-close off");
    return;
  }

  console.log(`[Lifecycle] auto-close on: ${hours} hours after survey`);

  const run = async () => {
    try {
      const closed = await closeFinishedLeads(hours);
      if (closed.length > 0) {
        console.log(`[Lifecycle] Auto-closed ${closed.length} finished lead(s)`);
      }
    } catch (error) {
      console.error(
        "[Lifecycle] Auto-close error:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  // First run after 60 seconds
  setTimeout(() => {
    void run();
  }, 60000);

  // Then every 60 minutes
  setInterval(() => {
    void run();
  }, 60 * 60 * 1000);
}
