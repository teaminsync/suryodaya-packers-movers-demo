/**
 * Enquiry lifecycle policy
 */

export const ENQUIRY_IDLE_DAYS = 30;

export type EnquiryCreateReason = "no_enquiry" | "closed" | "idle";

export type EnquiryDecision =
  | { action: "attach"; leadId: string }
  | { action: "create"; reason: EnquiryCreateReason };

export function decideEnquiry(
  latest: { id: string; closed_at: string | null; updated_at: string } | undefined,
  now: Date,
  idleDays: number = ENQUIRY_IDLE_DAYS
): EnquiryDecision {
  if (latest === undefined) {
    return { action: "create", reason: "no_enquiry" };
  }

  if (latest.closed_at !== null) {
    return { action: "create", reason: "closed" };
  }

  const idleMs = now.getTime() - new Date(latest.updated_at).getTime();
  if (idleMs > idleDays * 86400000) {
    return { action: "create", reason: "idle" };
  }

  return { action: "attach", leadId: latest.id };
}
