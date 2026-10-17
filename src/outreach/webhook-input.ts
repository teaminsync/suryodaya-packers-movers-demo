/**
 * Transform webhook message shapes for intent classification
 */

export interface InboundMessageShape {
  type: string;
  text?: { body?: string | null } | null;
  button?: { payload?: string | null; text?: string | null } | null;
}

export interface IntentInput {
  type: string;
  text: string | null;
  buttonPayload: string | null;
  buttonText: string | null;
}

export function toIntentInput(message: InboundMessageShape): { input: IntentInput; rawText: string | null } {
  if (message.type === "text") {
    const body = message.text?.body ?? null;
    return {
      input: {
        type: "text",
        text: body,
        buttonPayload: null,
        buttonText: null,
      },
      rawText: body,
    };
  }

  if (message.type === "button") {
    const payload = message.button?.payload ?? null;
    const text = message.button?.text ?? null;
    return {
      input: {
        type: "button",
        text: null,
        buttonPayload: payload,
        buttonText: text,
      },
      rawText: text ?? payload,
    };
  }

  return {
    input: {
      type: message.type,
      text: null,
      buttonPayload: null,
      buttonText: null,
    },
    rawText: null,
  };
}

export function buttonTapAsText<M extends InboundMessageShape>(message: M): M {
  if (message.type !== "button") {
    return message;
  }

  const t = message.button?.text;
  if (typeof t !== "string" || t.trim() === "") {
    return message;
  }

  return { ...message, type: "text", text: { body: t } } as unknown as M;
}
