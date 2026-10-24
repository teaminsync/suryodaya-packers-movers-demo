/**
 * De-duplication logic for admin notifications
 */

export const NOTIFY_DEDUPE_MINUTES = 10;

export function isRecentlySent(
  rows: Array<{ status: string; created_at: string | Date }>,
  now: Date,
  windowMinutes = NOTIFY_DEDUPE_MINUTES
): boolean {
  const windowMs = windowMinutes * 60 * 1000;

  for (const row of rows) {
    if (row.status !== "sent") {
      continue;
    }

    let createdAt: Date;
    if (row.created_at instanceof Date) {
      createdAt = row.created_at;
    } else {
      createdAt = new Date(row.created_at);
    }

    if (isNaN(createdAt.getTime())) {
      continue;
    }

    const ageMs = now.getTime() - createdAt.getTime();
    if (ageMs >= 0 && ageMs <= windowMs) {
      return true;
    }
  }

  return false;
}
