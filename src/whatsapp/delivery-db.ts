/**
 * Database wiring for delivery failure recording
 */

import { sql } from "../leads/db.js";
import type { FailedDelivery } from "./delivery.js";

export async function recordFailedDeliveries(list: FailedDelivery[]): Promise<number> {
  let insertedCount = 0;

  for (const item of list) {
    const now = new Date().toISOString();
    const failedAt = item.failedAt ? item.failedAt.toISOString() : now;

    const rows = await sql<{ id: string }[]>`
      INSERT INTO delivery_events (wamid, recipient, error_code, error_title, error_detail, failed_at, created_at)
      VALUES (${item.wamid}, ${item.recipient}, ${item.code}, ${item.title}, ${item.detail}, ${failedAt}, ${now})
      ON CONFLICT (wamid) DO NOTHING
      RETURNING wamid
    `;

    if (rows.length > 0) {
      insertedCount++;
    }

    // Update scheduled_actions
    const reason = `delivery failed: ${item.code}${item.title ? " " + item.title : ""}`;
    const truncatedReason = reason.length <= 200 ? reason : reason.substring(0, 200);

    await sql`
      UPDATE scheduled_actions
      SET status = 'failed', reason = ${truncatedReason}, processed_at = ${now}
      WHERE wamid = ${item.wamid}
        AND status = 'sent'
    `;

    // Log warning with last 4 digits only
    const recipientLast4 = item.recipient.length >= 4 ? item.recipient.slice(-4) : item.recipient;
    console.warn("[Delivery] Message failed after Meta accepted it:", {
      code: item.code,
      title: item.title,
      recipientLast4,
    });
  }

  return insertedCount;
}
