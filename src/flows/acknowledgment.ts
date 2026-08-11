/**
 * Instant acknowledgment with trust signal and ballpark
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import {
  COMPANY_PROFILE,
  getBallparkRange,
} from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";
import type { LeadQualification } from "./qualification.js";

const ackMessageSchema = z.object({
  message: z.string(),
});

/**
 * Generate instant acknowledgment message with trust signal and ballpark
 */
export async function generateAcknowledgment(
  qualification: LeadQualification
): Promise<string> {
  const ballpark = getBallparkRange(
    qualification.estimatedVolume,
    qualification.moveType
  );

  const request: AIRequest<typeof ackMessageSchema> = {
    systemPrompt: `You are a customer service representative for ${COMPANY_PROFILE.name}.

Company facts (use these exactly):
- ${COMPANY_PROFILE.gstDisplayText}
- Values: ${COMPANY_PROFILE.valuesStatement}
- Based in ${COMPANY_PROFILE.city}
- Demo disclosure: ${COMPANY_PROFILE.demoNumberDisclosureNote}

Generate a warm, professional acknowledgment message that:
1. Thanks them for reaching out
2. Mentions the demo disclosure naturally
3. States the trust signals (GST registration, no hidden charges)
4. Provides the ballpark range (clearly labeled as approximate)
5. Sets expectation for the next step (survey/slot booking)

Keep it conversational, not robotic. Use the provided ballpark range exactly, don't invent numbers.`,
    userPrompt: `Generate an acknowledgment for this enquiry:

Move type: ${qualification.moveType}
Origin: ${qualification.origin}
Destination: ${qualification.destination}
Estimated volume: ${qualification.estimatedVolume}
Urgency: ${qualification.urgency}
Special items: ${qualification.hasSpecialItems ? qualification.specialItems?.join(", ") || "yes" : "no"}
Packing needed: ${qualification.requiresPacking ? "yes" : "no"}

Ballpark range to use: ${ballpark}

Generate a single acknowledgment message (no subject line, just the message body).`,
    responseSchema: ackMessageSchema,
    taskName: "acknowledgment_generation",
  };

  const response = await aiRouter.call(request);
  return response.data.message;
}
