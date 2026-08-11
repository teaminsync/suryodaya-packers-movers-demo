/**
 * Booking slot generation and selection handling
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import { COMPANY_PROFILE } from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";
import type { SlotOption } from "../leads/types.js";

const slotMessageSchema = z.object({
  message: z.string(),
});

/**
 * Generate mock booking slots (next 3 business days, 2 slots each)
 */
export function generateSlotOptions(): SlotOption[] {
  const slots: SlotOption[] = [];
  const now = new Date();

  for (let daysOut = 1; daysOut <= 3; daysOut++) {
    const date = new Date(now);
    date.setDate(date.getDate() + daysOut);

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) {
      continue;
    }

    // Morning slot: 10:00 AM
    const morning = new Date(date);
    morning.setHours(10, 0, 0, 0);
    slots.push({
      label: `${date.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })} at 10:00 AM`,
      datetime: morning.toISOString(),
    });

    // Afternoon slot: 2:00 PM
    const afternoon = new Date(date);
    afternoon.setHours(14, 0, 0, 0);
    slots.push({
      label: `${date.toLocaleDateString("en-IN", { weekday: "short", month: "numeric", day: "numeric" })} at 2:00 PM`,
      datetime: afternoon.toISOString(),
    });

    if (slots.length >= 6) break;
  }

  return slots.slice(0, 3); // Return first 3 slots
}

/**
 * Format slot options as a numbered message
 */
export async function generateSlotMessage(
  slots: SlotOption[]
): Promise<string> {
  const slotList = slots
    .map((slot, idx) => `${idx + 1}. ${slot.label}`)
    .join("\n");

  const request: AIRequest<typeof slotMessageSchema> = {
    systemPrompt: `You are a scheduling assistant for ${COMPANY_PROFILE.name}.

Generate a brief, friendly message offering survey/inspection time slots.
The message should:
1. Explain this is for a quick home survey (15-30 min) to confirm the exact quote
2. Present the slot options
3. Ask them to reply with the number of their preferred slot

Keep it short and conversational.`,
    userPrompt: `Generate a message offering these time slots:

${slotList}

Just the message body, no subject line.`,
    responseSchema: slotMessageSchema,
    taskName: "booking_slot_message",
  };

  const response = await aiRouter.call(request);
  return response.data.message;
}

/**
 * Check if a message looks like a slot selection
 */
export function parseSlotSelection(
  messageText: string,
  slots: SlotOption[]
): SlotOption | null {
  const text = messageText.toLowerCase().trim();

  // Check for number match (1, 2, 3)
  for (let i = 0; i < slots.length; i++) {
    if (
      text === `${i + 1}` ||
      text.startsWith(`${i + 1}.`) ||
      text.startsWith(`${i + 1} `)
    ) {
      return slots[i];
    }
  }

  // Check for label match (fuzzy)
  for (const slot of slots) {
    const labelWords = slot.label.toLowerCase().split(/\s+/);
    const matchCount = labelWords.filter((word) => text.includes(word)).length;
    if (matchCount >= 2) {
      // At least 2 words match
      return slot;
    }
  }

  return null;
}

/**
 * Generate booking confirmation message
 */
export async function generateConfirmationMessage(
  selectedSlot: SlotOption
): Promise<string> {
  const confirmSchema = z.object({
    message: z.string(),
  });

  const request: AIRequest<typeof confirmSchema> = {
    systemPrompt: `You are a scheduling assistant for ${COMPANY_PROFILE.name}.

Generate a brief confirmation message for a booked survey slot.
The message should:
1. Confirm the booked time
2. Mention what to expect (surveyor will arrive, 15-30 min inspection)
3. Provide a warm, professional closing

Keep it short and reassuring.`,
    userPrompt: `Generate a confirmation for this booked slot:

${selectedSlot.label}

Just the message body.`,
    responseSchema: confirmSchema,
    taskName: "booking_confirmation",
  };

  const response = await aiRouter.call(request);
  return response.data.message;
}
