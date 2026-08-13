/**
 * Lead qualification flow using AI router
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import { COMPANY_PROFILE, getBallparkRange } from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";

/**
 * Lead information schema - all fields optional for incremental extraction
 */
export const leadInfoSchema = z.object({
  moveType: z.enum(["local", "intercity", "intracity"]).optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  urgency: z.enum(["low", "medium", "high", "urgent"]).optional(),
  hasSpecialItems: z.boolean().optional(),
  specialItems: z.array(z.string()).optional(),
  estimatedVolume: z.enum([
    "1bhk",
    "2bhk",
    "3bhk",
    "office",
    "commercial",
    "unknown",
  ]).optional(),
  requiresPacking: z.boolean().optional(),
});

export type LeadInfo = z.infer<typeof leadInfoSchema>;

/**
 * Unified turn response schema - single AI call per inbound message
 */
export const turnResponseSchema = z.object({
  extractedFields: leadInfoSchema,
  replyMessage: z.string(),
  wantsToBookSurvey: z.boolean(),
  wantsHuman: z.boolean(),
});

export type TurnResponse = z.infer<typeof turnResponseSchema>;

/**
 * Process a conversation turn - extract info, generate reply, detect intent
 */
export async function processConversationTurn(
  messageText: string,
  knownLeadInfo: Partial<LeadInfo>
): Promise<{
  data: TurnResponse;
  providerUsed: "claude" | "gemini";
  wasFailover: boolean;
}> {
  // Build context summary from known info
  const knownContext = Object.entries(knownLeadInfo)
    .filter(([_, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");

  const contextNote = knownContext
    ? `\n\nKnown information about this lead from prior conversation:\n${knownContext}`
    : "";

  // Calculate ballpark if we have enough info
  let ballparkInstruction = "";
  if (knownLeadInfo.moveType && knownLeadInfo.estimatedVolume) {
    const ballparkRange = getBallparkRange(
      knownLeadInfo.estimatedVolume,
      knownLeadInfo.moveType
    );
    ballparkInstruction = `\n\nBALLPARK PRICING: For this move (${knownLeadInfo.estimatedVolume} ${knownLeadInfo.moveType}), the approximate price range is ${ballparkRange}. If you mention pricing in your reply, you MUST use this exact figure - never invent or guess a different number. This is a ballpark only - an on-site survey gives the real quote.`;
  } else {
    ballparkInstruction = `\n\nBALLPARK PRICING: Not enough information yet to provide a price estimate. DO NOT mention any pricing figures in your reply. We need at least move type (local/intercity) and estimated volume (1bhk/2bhk/etc) before discussing price.`;
  }

  const request: AIRequest<typeof turnResponseSchema> = {
    systemPrompt: `You are a conversational assistant for ${COMPANY_PROFILE.name}, a ${COMPANY_PROFILE.gstDisplayText} packers and movers company based in ${COMPANY_PROFILE.city}.

The company operates in these service corridors: ${COMPANY_PROFILE.serviceCorridors.join(", ")}.

Your values: ${COMPANY_PROFILE.valuesStatement}.

${COMPANY_PROFILE.demoNumberDisclosureNote}

Your job is to:
1. Extract any NEW information the customer mentioned in their CURRENT message
2. Generate a natural, conversational reply
3. Detect if they want to book a survey or talk to a human

CRITICAL RULES FOR extractedFields:
- ONLY include fields that the customer stated or clearly implied in THEIR CURRENT MESSAGE
- Do NOT repeat, re-confirm, or re-derive values already known from prior context
- Leave fields absent from extractedFields even if they remain true
- Only include a field if THIS message adds or changes it

Classification guidelines for extraction:
- "local": moves within the same city
- "intercity": moves between different cities (e.g., Pune to Bengaluru)
- "intracity": same as local (synonym)
- For origin/destination: extract city names mentioned
- For urgency: "urgent" = within 48 hours, "high" = within a week, "medium" = 1-2 weeks, "low" = more than 2 weeks
- Special items: piano, antiques, artwork, electronics, fragile items, etc.
- Estimated volume: infer from phrases like "2 bedroom", "small apartment", "full house", "office space", etc.

Reply message guidelines:
- Write naturally, like continuing a conversation
- Acknowledge what they just said
- If a ballpark price is provided below, you may mention it naturally if appropriate for the conversation flow
- If important details are missing, ask ONE natural next question
- Don't be pushy about booking - make it an option, not a demand
- Be warm and helpful

Set wantsToBookSurvey to true if the customer explicitly asks to schedule, book, or set up a survey/visit.
Set wantsHuman to true if they ask to speak with a person, team member, or human.${contextNote}${ballparkInstruction}`,
    userPrompt: messageText,
    responseSchema: turnResponseSchema,
    taskName: "conversation_turn",
  };

  const response = await aiRouter.call(request);

  return {
    data: response.data,
    providerUsed: response.providerUsed,
    wasFailover: response.wasFailover,
  };
}
