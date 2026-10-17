/**
 * Consent state evaluation
 */

export const CONSENT_CHANNEL_WHATSAPP = "whatsapp";
export const CONSENT_SCOPE_FOLLOWUP = "follow_up";

export type ConsentState = "granted" | "withdrawn" | "unknown";

export interface ConsentRow {
  channel: string;
  scope: string;
  status: string;
  captured_at: string | Date;
}

export function currentConsent(
  rows: ConsentRow[],
  channel: string,
  scope?: string
): ConsentState {
  const filtered = rows.filter((row) => {
    if (row.channel !== channel) return false;
    if (scope !== undefined && row.scope !== scope) return false;
    if (row.status !== "granted" && row.status !== "withdrawn") return false;
    
    const time = new Date(row.captured_at).getTime();
    if (isNaN(time)) return false;
    
    return true;
  });

  if (filtered.length === 0) {
    return "unknown";
  }

  let latest = filtered[0];
  let latestTime = new Date(latest.captured_at).getTime();

  for (let i = 1; i < filtered.length; i++) {
    const time = new Date(filtered[i].captured_at).getTime();
    if (time >= latestTime) {
      latest = filtered[i];
      latestTime = time;
    }
  }

  return latest.status as ConsentState;
}
