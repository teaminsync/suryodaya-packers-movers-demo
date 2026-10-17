/**
 * Message templates, intent detection and helpers
 */

export const TEMPLATE_ENQUIRY_FOLLOWUP = "enquiry_followup";
export const TEMPLATE_LANGUAGE = "en";
export const BUTTON_PAYLOAD_YES = "enquiry_yes";
export const BUTTON_PAYLOAD_NOT_NOW = "enquiry_not_now";

export type InboundIntent =
  | { kind: "opt_out" }
  | { kind: "followup_yes" }
  | { kind: "followup_not_now" }
  | { kind: "none" };

export function classifyInboundIntent(input: {
  type: string;
  text?: string | null;
  buttonPayload?: string | null;
  buttonText?: string | null;
}): InboundIntent {
  if (input.type === "button") {
    if (input.buttonPayload === BUTTON_PAYLOAD_YES) {
      return { kind: "followup_yes" };
    }

    if (input.buttonPayload === BUTTON_PAYLOAD_NOT_NOW) {
      return { kind: "followup_not_now" };
    }

    if (!input.buttonPayload && input.buttonText) {
      const normalized = input.buttonText.trim().toLowerCase();
      if (normalized === "yes, continue") {
        return { kind: "followup_yes" };
      }
      if (normalized === "not now") {
        return { kind: "followup_not_now" };
      }
    }

    return { kind: "none" };
  }

  if (input.type === "text") {
    if (!input.text) {
      return { kind: "none" };
    }

    let normalized = input.text.trim().toLowerCase();
    while (normalized.length > 0) {
      const last = normalized[normalized.length - 1];
      if (last === "." || last === "!" || last === "?") {
        normalized = normalized.slice(0, -1);
      } else {
        break;
      }
    }
    normalized = normalized.trim();

    const optOutPhrases = [
      "stop",
      "stop all",
      "stop messages",
      "unsubscribe",
      "opt out",
      "optout",
    ];

    if (optOutPhrases.includes(normalized)) {
      return { kind: "opt_out" };
    }

    return { kind: "none" };
  }

  return { kind: "none" };
}

export function firstName(displayName: string | null | undefined): string | null {
  if (!displayName) {
    return null;
  }

  const trimmed = displayName.trim();
  if (trimmed === "") {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  return parts[0];
}

export function sanitizeTemplateValue(value: string, maxLength?: number): string {
  const max = maxLength ?? 60;
  let result = value.replace(/\s+/g, " ").trim();
  result = result.slice(0, max).trim();
  return result;
}

export function buildFollowupTemplateParams(input: {
  contactName: string | null;
  origin: string | null;
  destination: string | null;
}): [string, string] {
  const name = sanitizeTemplateValue(firstName(input.contactName) ?? "there");

  let route: string;
  if (input.origin && input.origin.trim() !== "" && input.destination && input.destination.trim() !== "") {
    route = sanitizeTemplateValue(`${input.origin} to ${input.destination}`);
  } else {
    route = "details to confirm";
  }

  return [name, route];
}

export function buildClickToChatLink(input: {
  businessNumber: string;
  leadId: string;
}): string {
  const digits = input.businessNumber.replace(/\D/g, "");
  const ref = input.leadId.slice(0, 8);
  const text = `Hi, I enquired about my move (ref ${ref})`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
