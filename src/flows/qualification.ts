/**
 * Lead qualification flow using AI router
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import { COMPANY_PROFILE } from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";

/**
 * Lead qualification schema (from demo-usage.ts, now load-bearing)
 */
export const leadQualificationSchema = z.object({
  moveType: z.enum(["local", "intercity", "intracity"]),
  origin: z.string(),
  destination: z.string(),
  urgency: z.enum(["low", "medium", "high", "urgent"]),
  hasSpecialItems: z.boolean(),
  specialItems: z.array(z.string()).optional(),
  estimatedVolume: z.enum([
    "1bhk",
    "2bhk",
    "3bhk",
    "office",
    "commercial",
    "unknown",
  ]),
  requiresPacking: z.boolean(),
});

export type LeadQualification = z.infer<typeof leadQualificationSchema>;

/**
 * Qualify a lead from enquiry text
 */
export async function qualifyLead(enquiryText: string) {
  const request: AIRequest<typeof leadQualificationSchema> = {
    systemPrompt: `You are a lead qualification assistant for ${COMPANY_PROFILE.name}, based in ${COMPANY_PROFILE.city}.

The company operates in these service corridors: ${COMPANY_PROFILE.serviceCorridors.join(", ")}.

Extract structured information from customer enquiries about moving/relocation services.

Classification guidelines:
- "local": moves within the same city
- "intercity": moves between different cities (e.g., Pune to Bengaluru)
- "intracity": same as local (synonym)
- For origin/destination: extract city names mentioned, or use "${COMPANY_PROFILE.city}" if only one city is mentioned
- For urgency: "urgent" = within 48 hours, "high" = within a week, "medium" = 1-2 weeks, "low" = more than 2 weeks
- Special items: piano, antiques, artwork, electronics, fragile items, etc.
- Estimated volume: infer from phrases like "2 bedroom", "small apartment", "full house", "office space", etc.`,
    userPrompt: enquiryText,
    responseSchema: leadQualificationSchema,
    taskName: "lead_qualification",
  };

  const response = await aiRouter.call(request);

  return {
    data: response.data,
    providerUsed: response.providerUsed,
    wasFailover: response.wasFailover,
  };
}
