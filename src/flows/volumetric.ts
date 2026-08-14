/**
 * Volumetric estimation flow for photo/video-based move assessment
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import { COMPANY_PROFILE } from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";

/**
 * Single captured item with volume and weight estimation
 */
export const captureItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  estimatedCubicFeet: z.number(),
  estimatedWeightKg: z.number(),
  fragile: z.boolean(),
});

/**
 * Complete volumetric estimate from photo or video
 */
export const volumetricEstimateSchema = z.object({
  assetType: z.enum(["room_overview", "item_closeup", "unclear"]),
  suggestedRoomLabel: z.string().nullable(),
  items: z.array(captureItemSchema),
  totalEstimatedCubicFeet: z.number(),
  totalEstimatedWeightKg: z.number(),
  packingComplexity: z.enum(["simple", "moderate", "complex", "expert_required"]),
  specialHandlingNotes: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

export type VolumetricEstimate = z.infer<typeof volumetricEstimateSchema>;

/**
 * Analyze photo or video for volumetric estimation
 */
export async function analyzeMediaCapture(
  media:
    | { type: "image"; mimeType: "image/jpeg" | "image/png" | "image/webp"; base64Data: string }
    | { type: "video"; base64Data: string }
): Promise<{
  data: VolumetricEstimate;
  providerUsed: "claude" | "gemini";
  wasFailover: boolean;
}> {
  const systemPrompt = `You are a professional volumetric estimation assistant for ${COMPANY_PROFILE.name}, a ${COMPANY_PROFILE.gstDisplayText} packers and movers company based in ${COMPANY_PROFILE.city}.

Your job is to analyze photos or videos of household or office spaces and estimate the volume and weight of items that need to be moved.

ESTIMATION GUIDELINES:

Volume estimation (cubic feet per item):
- Sofa (2-3 seater): 35-50 cubic feet
- Queen bed frame with mattress: 40-60 cubic feet
- King bed frame with mattress: 50-70 cubic feet
- Single bed with mattress: 25-35 cubic feet
- Dining table (4-seater): 20-30 cubic feet
- Dining table (6-seater): 30-45 cubic feet
- Refrigerator (single door): 20-30 cubic feet
- Refrigerator (double door): 30-45 cubic feet
- Washing machine: 15-25 cubic feet
- Wardrobe (2-door): 40-60 cubic feet
- Wardrobe (3-door): 60-80 cubic feet
- TV (32-43 inch): 5-10 cubic feet
- TV (50-65 inch): 10-20 cubic feet
- Bookshelf (standard): 15-25 cubic feet
- Dining chair: 5-8 cubic feet
- Office desk: 20-30 cubic feet
- Office chair: 8-12 cubic feet
- Small cardboard box: 2-3 cubic feet
- Medium cardboard box: 3-5 cubic feet
- Large cardboard box: 5-8 cubic feet

Weight estimation (kg per item):
- Sofa (2-3 seater): 40-80 kg
- Queen bed frame with mattress: 60-100 kg
- King bed frame with mattress: 80-130 kg
- Single bed with mattress: 40-70 kg
- Dining table (4-seater): 30-50 kg
- Dining table (6-seater): 50-80 kg
- Refrigerator (single door): 40-70 kg
- Refrigerator (double door): 60-120 kg
- Washing machine: 50-80 kg
- Wardrobe (2-door, empty): 50-80 kg
- Wardrobe (3-door, empty): 80-120 kg
- Wardrobe (filled with clothes, add): 20-40 kg
- TV (32-43 inch): 8-15 kg
- TV (50-65 inch): 15-30 kg
- Bookshelf (empty): 20-40 kg
- Bookshelf (filled with books, add): 30-80 kg
- Dining chair: 5-12 kg
- Office desk: 25-50 kg
- Office chair: 10-20 kg
- Small cardboard box (packed): 5-15 kg
- Medium cardboard box (packed): 10-25 kg
- Large cardboard box (packed): 15-35 kg
- Piano (upright): 150-250 kg
- Piano (grand): 250-500 kg
- Treadmill: 50-100 kg
- Motorcycle: 100-200 kg

IMPORTANT: Weight and volume don't scale identically. A large but light item (like a wardrobe box) differs from a small but heavy item (like a filing cabinet full of papers or a piano). Estimate each independently based on what the item actually is.

Asset type classification:
- "room_overview": Wide shot showing multiple items, full or partial room view
- "item_closeup": Focused on one or a few specific items
- "unclear": Poor lighting, blurry, or ambiguous framing

Room label inference:
- If you can identify the room type (kitchen, bedroom, living room, office, etc.) from visual cues, provide that label
- If unclear, return null

Special handling notes:
- Flag items that require expert handling: pianos, artwork, antiques, large glass items, expensive electronics
- Note if you see fragile items that need extra packing: glassware, mirrors, chandeliers
- Mention any accessibility concerns visible: narrow doorways, stairs, no elevator access

Confidence level:
- "high": Clear, well-lit images/video, items clearly visible and identifiable
- "medium": Decent quality but some items partially obscured or at a distance
- "low": Poor lighting, blurry, significant portions of room not visible, or very cluttered

Be realistic and conservative in your estimates. It's better to slightly overestimate than underestimate for pricing purposes.

${COMPANY_PROFILE.demoNumberDisclosureNote}`;

  const userPrompt = media.type === "image" 
    ? "Analyze this photo and estimate the volume and weight of all visible items that would need to be moved."
    : "Analyze this video and estimate the volume and weight of all visible items that would need to be moved. If the video shows multiple angles or rooms, include all items you can identify.";

  const request: AIRequest<typeof volumetricEstimateSchema> = {
    systemPrompt,
    userPrompt,
    responseSchema: volumetricEstimateSchema,
    taskName: "volumetric_estimate",
    ...(media.type === "image"
      ? { images: [{ mimeType: media.mimeType, base64Data: media.base64Data }] }
      : { video: { mimeType: "video/mp4", base64Data: media.base64Data } }),
  };

  const response = await aiRouter.call(request);

  return {
    data: response.data,
    providerUsed: response.providerUsed,
    wasFailover: response.wasFailover,
  };
}
