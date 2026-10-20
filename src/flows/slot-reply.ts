export interface SlotChoice {
  label: string;
  datetime: string;
}

export type SlotReplyResult =
  | { kind: "select"; index: number }
  | { kind: "stale" }
  | { kind: "none" };

export function evaluateSlotReply(input: {
  text: string;
  slots: SlotChoice[];
  now: Date;
}): SlotReplyResult {
  const t = input.text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (t === "") {
    return { kind: "none" };
  }

  const numberMatch = /^(?:option|slot|number|no\.?|#)?\s*(\d{1,2})\s*[.)!]?$/.exec(t);
  if (numberMatch) {
    const n = Number(numberMatch[1]);
    if (n < 1 || n > input.slots.length) {
      return { kind: "none" };
    }
    const index = n - 1;
    const slot = input.slots[index];
    const slotTime = new Date(slot.datetime).getTime();
    if (Number.isNaN(slotTime) || slotTime <= input.now.getTime()) {
      return { kind: "stale" };
    }
    return { kind: "select", index };
  }

  const stripped = t.replace(/[.!?]+$/, "").trim();
  for (let i = 0; i < input.slots.length; i++) {
    const slotLabel = input.slots[i].label
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (stripped === slotLabel) {
      const slotTime = new Date(input.slots[i].datetime).getTime();
      if (Number.isNaN(slotTime) || slotTime <= input.now.getTime()) {
        return { kind: "stale" };
      }
      return { kind: "select", index: i };
    }
  }

  return { kind: "none" };
}
