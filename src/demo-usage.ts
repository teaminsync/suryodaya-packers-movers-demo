/**
 * Demo: How to use the AI router in application code
 * 
 * This shows the intended usage pattern for features like:
 * - Lead qualification
 * - Urgency scoring
 * - Volumetric estimation from images
 * - Quote drafting
 * - Follow-up message generation
 */

import { z } from "zod";
import { aiRouter } from "./ai/router.js";
import type { AIRequest } from "./ai/types.js";

// Example 1: Lead Qualification Schema
const leadQualificationSchema = z.object({
  moveType: z.enum(["local", "intercity", "intracity"]),
  origin: z.string(),
  destination: z.string(),
  urgency: z.enum(["low", "medium", "high", "urgent"]),
  hasSpecialItems: z.boolean(),
  specialItems: z.array(z.string()).optional(),
  estimatedVolume: z.enum(["1bhk", "2bhk", "3bhk", "office", "commercial", "unknown"]),
  requiresPacking: z.boolean(),
});

async function qualifyLead(enquiryText: string) {
  const request: AIRequest<typeof leadQualificationSchema> = {
    systemPrompt: `You are a lead qualification assistant for Suryodaya Packers & Movers.
Extract structured information from customer enquiries about moving/relocation services.`,
    userPrompt: enquiryText,
    responseSchema: leadQualificationSchema,
    taskName: "lead_qualification",
  };

  const response = await aiRouter.call(request);
  return response;
}

// Example 2: Volumetric Estimation from Images
const volumetricEstimateSchema = z.object({
  roomType: z.string(),
  estimatedCubicFeet: z.number(),
  furnitureItems: z.array(
    z.object({
      item: z.string(),
      quantity: z.number(),
      estimatedVolume: z.number(),
    })
  ),
  packingComplexity: z.enum(["simple", "moderate", "complex", "expert_required"]),
  specialHandlingRequired: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

async function estimateVolumeFromImages(images: Array<{ base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" }>) {
  const request: AIRequest<typeof volumetricEstimateSchema> = {
    systemPrompt: `You are a volumetric estimation expert for moving companies.
Analyze room photos and provide accurate estimates of furniture volume and packing requirements.`,
    userPrompt: `Analyze these room images and provide:
- Room type identification
- Total estimated cubic feet
- Detailed furniture inventory with volume estimates
- Packing complexity assessment
- Special handling requirements (fragile items, heavy items, etc.)
- Your confidence in the estimate`,
    images: images.map((img) => ({
      base64Data: img.base64,
      mimeType: img.mimeType,
    })),
    responseSchema: volumetricEstimateSchema,
    taskName: "volumetric_estimate",
    maxOutputTokens: 4096,
  };

  const response = await aiRouter.call(request);
  return response;
}

// Example 3: Quote Generation
const quoteSchema = z.object({
  basePrice: z.number(),
  packingCharges: z.number(),
  loadingUnloadingCharges: z.number(),
  transportCharges: z.number(),
  specialItemsCharges: z.number().optional(),
  insurance: z.number().optional(),
  totalPrice: z.number(),
  priceBreakdown: z.array(
    z.object({
      item: z.string(),
      amount: z.number(),
      description: z.string(),
    })
  ),
  validUntil: z.string(),
  terms: z.array(z.string()),
});

async function generateQuote(
  moveDetails: z.infer<typeof leadQualificationSchema>,
  volumetricData: z.infer<typeof volumetricEstimateSchema>
) {
  const request: AIRequest<typeof quoteSchema> = {
    systemPrompt: `You are a pricing expert for Suryodaya Packers & Movers.
Generate detailed, transparent quotes based on move details and volumetric estimates.
Use standard industry rates for the Pune/Mumbai region.`,
    userPrompt: `Generate a quote for this move:
    
Move Details:
${JSON.stringify(moveDetails, null, 2)}

Volumetric Estimate:
${JSON.stringify(volumetricData, null, 2)}

Provide itemized pricing with clear breakdown and standard terms.`,
    responseSchema: quoteSchema,
    taskName: "quote_generation",
  };

  const response = await aiRouter.call(request);
  return response;
}

// Example 4: Follow-up Message Generation
const followUpMessageSchema = z.object({
  message: z.string(),
  tone: z.enum(["professional", "friendly", "urgent"]),
  suggestedSendTime: z.string(),
  includesCallToAction: z.boolean(),
});

async function generateFollowUpMessage(
  customerName: string,
  lastInteraction: string,
  context: string
) {
  const request: AIRequest<typeof followUpMessageSchema> = {
    systemPrompt: `You are a customer success assistant for Suryodaya Packers & Movers.
Generate personalized, timely follow-up messages that maintain engagement without being pushy.`,
    userPrompt: `Generate a follow-up message for:
    
Customer: ${customerName}
Last Interaction: ${lastInteraction}
Context: ${context}

The message should be warm, helpful, and encourage the next step in the booking process.`,
    responseSchema: followUpMessageSchema,
    taskName: "follow_up_generation",
  };

  const response = await aiRouter.call(request);
  return response;
}

// Demo execution (commented out - would need real API keys)
async function runDemo() {
  console.log("=== AI Router Usage Demo ===\n");

  // This would work once you have API keys configured
  /*
  const leadResult = await qualifyLead(
    "Hi, need to move my 2BHK from Pune to Bengaluru next week. Have a piano and some fragile antiques."
  );
  
  console.log("Lead Qualification Result:");
  console.log(JSON.stringify(leadResult.data, null, 2));
  console.log(`Provider: ${leadResult.providerUsed}, Failover: ${leadResult.wasFailover}`);
  */

  console.log("See the schema definitions above for how features will use the AI router.");
  console.log("All application code imports from './ai/router.js' and never touches providers directly.");
}

// Export for use in other modules
export {
  qualifyLead,
  estimateVolumeFromImages,
  generateQuote,
  generateFollowUpMessage,
};

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}
