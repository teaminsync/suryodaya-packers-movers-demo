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
  | { kind: "show_times" }
  | { kind: "reminder_confirm" }
  | { kind: "reminder_change" }
  | { kind: "talk_human" }
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

    // New automation payloads
    if (input.buttonPayload === "nudge_show_times") {
      return { kind: "show_times" };
    }

    if (input.buttonPayload === "nudge_not_now") {
      return { kind: "followup_not_now" };
    }

    if (input.buttonPayload === "nudge_stop") {
      return { kind: "opt_out" };
    }

    if (input.buttonPayload === "reminder_confirm") {
      return { kind: "reminder_confirm" };
    }

    if (input.buttonPayload === "reminder_change") {
      return { kind: "reminder_change" };
    }

    if (input.buttonPayload === "missing_talk_human") {
      return { kind: "talk_human" };
    }

    if (input.buttonText) {
      const normalized = input.buttonText.trim().toLowerCase();
      if (normalized === "yes, continue") {
        return { kind: "followup_yes" };
      }
      if (normalized === "not now") {
        return { kind: "followup_not_now" };
      }
      if (normalized === "show me times") {
        return { kind: "show_times" };
      }
      if (normalized === "stop messages") {
        return { kind: "opt_out" };
      }
      if (normalized === "confirm time") {
        return { kind: "reminder_confirm" };
      }
      if (normalized === "change time") {
        return { kind: "reminder_change" };
      }
      if (normalized === "talk to a human") {
        return { kind: "talk_human" };
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

export function renderFollowupTemplateText(params: [string, string]): string {
  return `Hi ${params[0]}, this is Suryodaya Packers & Movers following up on your moving enquiry (${params[1]}). Would you like to continue on WhatsApp? We can share a ballpark estimate and free survey times right here.`;
}

export interface TemplateRequestInput {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  buttonPayloads?: string[];
}

export function buildTemplateRequestBody(input: TemplateRequestInput): Record<string, unknown> {
  const components: any[] = [];

  if (input.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParams.map(t => ({ type: "text", text: t })),
    });
  }

  if (input.buttonPayloads) {
    for (let i = 0; i < input.buttonPayloads.length; i++) {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(i),
        parameters: [{ type: "payload", payload: input.buttonPayloads[i] }],
      });
    }
  }

  const template: any = {
    name: input.templateName,
    language: { code: input.languageCode },
  };

  if (components.length > 0) {
    template.components = components;
  }

  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template,
  };
}
