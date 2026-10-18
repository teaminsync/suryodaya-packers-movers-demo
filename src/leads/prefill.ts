/**
 * Pure prefill logic for enquiry fields
 */

export const PREFILL_MIN_TEXT_LENGTH = 10;
export const PREFILL_MAX_TEXT_LENGTH = 2000;
export const PREFILL_MAX_VALUE_LENGTH = 200;

export function isPlaceholderText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 2 && trimmed.startsWith("[") && trimmed.endsWith("]");
}

export function normalizeExtractedKeys(extracted: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    moveType: "move_type",
    estimatedVolume: "estimated_volume",
  };

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extracted)) {
    const mapped = map[key] ?? key;
    if (mapped !== key && Object.prototype.hasOwnProperty.call(extracted, mapped)) {
      continue;
    }
    out[mapped] = value;
  }

  return out;
}

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) {
    return false;
  }
  if (typeof v === "string") {
    return v.trim() !== "";
  }
  return true;
}

export function planPrefill(input: {
  current: Record<string, unknown>;
  extracted: Record<string, unknown> | null | undefined;
  allowed: readonly string[];
}): { fields: Record<string, string>; skipped: string[] } {
  const fields: Record<string, string> = {};
  const skipped: string[] = [];

  for (const key of input.allowed) {
    const value = input.extracted?.[key];

    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }

    if (hasValue(input.current[key])) {
      skipped.push(key);
    } else {
      fields[key] = value.trim().slice(0, PREFILL_MAX_VALUE_LENGTH);
    }
  }

  return { fields, skipped };
}

export type PrefillStatus =
  | "filled"
  | "nothing_to_fill"
  | "skipped_no_text"
  | "lead_not_found"
  | "extract_failed"
  | "apply_failed";

export interface PrefillDeps {
  getLeadFields(leadId: string): Promise<Record<string, unknown> | undefined>;
  extractFields(text: string): Promise<Record<string, unknown> | null>;
  applyFields(leadId: string, fields: Record<string, string>): Promise<void>;
}

export interface PrefillResult {
  status: PrefillStatus;
  filled: string[];
}

export async function prefillEnquiry(
  input: { leadId: string; text: string; allowed: readonly string[] },
  deps: PrefillDeps
): Promise<PrefillResult> {
  const text = input.text.trim();

  if (text.length < PREFILL_MIN_TEXT_LENGTH || isPlaceholderText(text)) {
    return { status: "skipped_no_text", filled: [] };
  }

  const current = await deps.getLeadFields(input.leadId);
  if (current === undefined) {
    return { status: "lead_not_found", filled: [] };
  }

  const allFilled = input.allowed.every((key) => hasValue(current[key]));
  if (allFilled) {
    return { status: "nothing_to_fill", filled: [] };
  }

  let extracted: Record<string, unknown> | null;
  try {
    extracted = await deps.extractFields(text.slice(0, PREFILL_MAX_TEXT_LENGTH));
  } catch (error) {
    console.error("[Prefill] Extraction failed:", error instanceof Error ? error.message : String(error));
    return { status: "extract_failed", filled: [] };
  }

  if (extracted === null) {
    return { status: "extract_failed", filled: [] };
  }

  const plan = planPrefill({ current, extracted, allowed: input.allowed });

  if (Object.keys(plan.fields).length === 0) {
    return { status: "nothing_to_fill", filled: [] };
  }

  try {
    await deps.applyFields(input.leadId, plan.fields);
  } catch (error) {
    console.error("[Prefill] Saving extracted details failed:", error instanceof Error ? error.message : String(error));
    return { status: "apply_failed", filled: [] };
  }

  return { status: "filled", filled: Object.keys(plan.fields) };
}
