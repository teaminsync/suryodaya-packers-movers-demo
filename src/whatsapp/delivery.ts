/**
 * Delivery failure extraction (pure logic)
 */

export interface FailedDelivery {
  wamid: string;
  recipient: string;
  code: string;
  title: string | null;
  detail: string | null;
  failedAt: Date | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    return new Date(value * 1000);
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return new Date(parsed * 1000);
    }
  }
  return null;
}

function truncate(value: string | undefined | null, maxLength: number): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.length <= maxLength ? trimmed : trimmed.substring(0, maxLength);
}

export function extractFailedDeliveries(payload: unknown): FailedDelivery[] {
  if (!isObject(payload)) {
    return [];
  }

  const entry = payload.entry;
  if (!isArray(entry)) {
    return [];
  }

  const results: FailedDelivery[] = [];

  for (const entryItem of entry) {
    if (!isObject(entryItem)) {
      continue;
    }

    const changes = entryItem.changes;
    if (!isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      if (!isObject(change)) {
        continue;
      }

      const value = change.value;
      if (!isObject(value)) {
        continue;
      }

      const statuses = value.statuses;
      if (!isArray(statuses)) {
        continue;
      }

      for (const statusItem of statuses) {
        if (!isObject(statusItem)) {
          continue;
        }

        const status = statusItem.status;
        if (status !== "failed") {
          continue;
        }

        const id = statusItem.id;
        if (typeof id !== "string" || id.trim() === "") {
          continue;
        }

        const recipientId = statusItem.recipient_id;
        const recipient = typeof recipientId === "string" ? recipientId : "";

        const errors = statusItem.errors;
        let code = "unknown";
        let title: string | null = null;
        let detail: string | null = null;

        if (isArray(errors) && errors.length > 0) {
          const firstError = errors[0];
          if (isObject(firstError)) {
            const errorCode = firstError.code;
            code = String(errorCode);

            title = truncate(firstError.title as string | undefined, 200);

            const errorData = firstError.error_data;
            if (isObject(errorData)) {
              detail = truncate(errorData.details as string | undefined, 300);
            }

            if (!detail) {
              detail = truncate(firstError.message as string | undefined, 300);
            }
          }
        }

        const failedAt = parseTimestamp(statusItem.timestamp);

        results.push({
          wamid: id.trim(),
          recipient,
          code,
          title,
          detail,
          failedAt,
        });
      }
    }
  }

  return results;
}
