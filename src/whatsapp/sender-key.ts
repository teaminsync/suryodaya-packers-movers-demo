/**
 * Extract sender key from WhatsApp webhook payload
 */

export function senderKeyFromPayload(payload: unknown): string {
  try {
    if (!payload || typeof payload !== "object") {
      return "unknown";
    }

    const p = payload as any;
    
    if (!Array.isArray(p.entry) || p.entry.length === 0) {
      return "unknown";
    }

    const entry = p.entry[0];
    if (!entry || typeof entry !== "object") {
      return "unknown";
    }

    if (!Array.isArray(entry.changes) || entry.changes.length === 0) {
      return "unknown";
    }

    const change = entry.changes[0];
    if (!change || typeof change !== "object") {
      return "unknown";
    }

    const value = change.value;
    if (!value || typeof value !== "object") {
      return "unknown";
    }

    if (!Array.isArray(value.messages) || value.messages.length === 0) {
      return "unknown";
    }

    const message = value.messages[0];
    if (!message || typeof message !== "object") {
      return "unknown";
    }

    const from = message.from;
    if (typeof from === "string" && from.length > 0) {
      return from;
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}
