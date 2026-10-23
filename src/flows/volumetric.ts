/**
 * Volumetric estimation flow for photo/video-based move assessment
 */

import { z } from "zod";
import { aiRouter } from "../ai/router.js";
import { COMPANY_PROFILE } from "../company/profile.js";
import type { AIRequest } from "../ai/types.js";
import {
  ROOM_KEYS,
  type InventoryGroup,
  formatInventoryContext,
  resolveRoom,
  computeCaptureTotals,
  normaliseSameRoomAs,
} from "./rooms.js";

/**
 * Single captured item with volume and weight estimation
 */
export const captureItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  estimatedCubicFeet: z.number(),
  estimatedWeightKg: z.number(),
  fragile: z.boolean(),
  alreadyCounted: z.boolean(),
});

/**
 * Complete volumetric estimate from photo or video
 */
export const volumetricEstimateSchema = z.object({
  assetType: z.enum(["room_overview", "item_closeup", "unclear"]),
  roomKey: z.enum(ROOM_KEYS),
  sameRoomAs: z.string().nullable(),
  items: z.array(captureItemSchema),
  packingComplexity: z.enum(["simple", "moderate", "complex", "expert_required"]),
  specialHandlingNotes: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

export type VolumetricEstimate = z.infer<typeof volumetricEstimateSchema>;

/**
 * Build the AI request for volumetric estimation (without calling the router)
 */
export function buildVolumetricRequest(
  media:
    | { type: "image"; mimeType: "image/jpeg" | "image/png" | "image/webp"; base64Data: string }
    | { type: "video"; base64Data: string },
  existingInventory: InventoryGroup[] = []
): AIRequest<typeof volumetricEstimateSchema> {
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

The per-item figures above are PER UNIT. In your output, estimatedCubicFeet and estimatedWeightKg on each line are the TOTAL for that whole line (per-unit figure multiplied by quantity).

IMPORTANT: Weight and volume don't scale identically. A large but light item (like a wardrobe box) differs from a small but heavy item (like a filing cabinet full of papers or a piano). Estimate each independently based on what the item actually is.

WHAT TO COUNT:
- List only things a mover would actually carry out of the home: furniture, freestanding appliances, boxes, rugs, mirrors and loose decor.
- Do NOT list fixtures that stay with the property: built-in or fitted cabinets and wardrobes, kitchen countertops, sinks, tiles, wall paint, windows, curtain rails, ceiling lights, fans and wall-mounted fittings.
- A freestanding refrigerator, cooking range, washing machine or kitchen island IS counted.
- Only list items you can actually see in the image. Never add boxes, packing materials or other items you assume the customer will pack.

Asset type classification:
- "room_overview": Wide shot showing multiple items, full or partial room view
- "item_closeup": Focused on one or a few specific items
- "unclear": Poor lighting, blurry, or ambiguous framing

ROOM IDENTIFICATION AND DUPLICATES:
- roomKey: choose exactly one of living_room, bedroom, kitchen, dining, bathroom, balcony, study_office, storeroom, other. Use "other" if you cannot tell. You choose only the room TYPE; never invent names like "master" or "kids".
- sameRoomAs: if an "ITEMS ALREADY COUNTED" list is provided and this photo or video clearly shows the same physical room as one listed there, set sameRoomAs to that room's label exactly as written in the list. If it is a different room (even of the same type, such as a second bedroom), or you are not sure, set sameRoomAs to null (if you must write text, write the single word none).
- alreadyCounted: set true for an item line ONLY if sameRoomAs is not null and the item is clearly the same physical item (same type and same appearance) as an item already listed for that room. If sameRoomAs is null, every line must be false. If unsure, use false. If the photo shows more units than were already counted (for example 6 chairs when 4 were counted), return that line with alreadyCounted false and quantity equal to only the additional units. Still estimate volume and weight for lines you mark alreadyCounted true.

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

  const inventoryContext = formatInventoryContext(existingInventory);
  
  let userPrompt = media.type === "image" 
    ? "Analyze this photo and estimate the volume and weight of all visible items that would need to be moved."
    : "Analyze this video and estimate the volume and weight of all visible items that would need to be moved. If the video shows multiple angles or rooms, include all items you can identify.";
  
  if (inventoryContext) {
    userPrompt += "\n\n" + inventoryContext;
  }

  return {
    systemPrompt,
    userPrompt,
    responseSchema: volumetricEstimateSchema,
    taskName: "volumetric_estimate",
    ...(media.type === "image"
      ? { images: [{ mimeType: media.mimeType, base64Data: media.base64Data }] }
      : { video: { mimeType: "video/mp4", base64Data: media.base64Data } }),
  };
}

/**
 * Finalize the volumetric estimate data (normalize and compute totals)
 */
export function finalizeVolumetric(
  data: VolumetricEstimate,
  existingInventory: InventoryGroup[] = []
): {
  data: VolumetricEstimate;
  room: ReturnType<typeof resolveRoom>;
  totals: ReturnType<typeof computeCaptureTotals>;
} {
  // Normalize sameRoomAs
  const sameRoomAsClean = normaliseSameRoomAs(data.sameRoomAs);

  // Resolve room (matching against existing inventory)
  const room = resolveRoom(
    data.roomKey,
    sameRoomAsClean,
    existingInventory
  );

  // Safety rule: if room didn't match existing, force all alreadyCounted to false
  let correctedItems = data.items;
  if (!room.matchedExisting) {
    correctedItems = data.items.map((item) => ({
      ...item,
      alreadyCounted: false,
    }));
  }

  // Compute totals (only new items)
  const totals = computeCaptureTotals(correctedItems);

  return {
    data: { ...data, sameRoomAs: sameRoomAsClean, items: correctedItems },
    room,
    totals,
  };
}

/**
 * Analyze photo or video for volumetric estimation
 */
export async function analyzeMediaCapture(
  media:
    | { type: "image"; mimeType: "image/jpeg" | "image/png" | "image/webp"; base64Data: string }
    | { type: "video"; base64Data: string },
  existingInventory: InventoryGroup[] = []
): Promise<{
  data: VolumetricEstimate;
  room: ReturnType<typeof resolveRoom>;
  totals: ReturnType<typeof computeCaptureTotals>;
  providerUsed: import("../ai/types.js").ProviderName;
  wasFailover: boolean;
}> {
  const request = buildVolumetricRequest(media, existingInventory);
  const response = await aiRouter.call(request);
  const finalized = finalizeVolumetric(response.data, existingInventory);

  return {
    ...finalized,
    providerUsed: response.providerUsed,
    wasFailover: response.wasFailover,
  };
}

export function buildCaptureReply(input: {
  roomLabel: string;
  items: Array<{ name: string; quantity: number; alreadyCounted: boolean }>;
  addedCubicFeet: number;
  addedWeightKg: number;
}): string {
  const newItems = input.items.filter((item) => !item.alreadyCounted);
  const duplicateCount = input.items.filter((item) => item.alreadyCounted).length;

  if (newItems.length === 0) {
    return `That looks like the same items I've already counted for your ${input.roomLabel}, so your move total hasn't changed.\n\nIf this is actually a different room, just tell me, for example "this is the master bedroom".\n\nSend another room's photo or video anytime, or tap "Get My Move Total" to see everything so far.`;
  }

  const itemsToShow = newItems.slice(0, 5);
  const itemList = itemsToShow
    .map((item) => `• ${item.name} (${item.quantity})`)
    .join("\n");

  const moreItems =
    newItems.length > 5 ? `\n...and ${newItems.length - 5} more items` : "";

  const dupNote =
    duplicateCount > 0
      ? `\n\n(I'd already counted ${duplicateCount} item(s) from your earlier photos, so I haven't added them twice.)`
      : "";

  return `Got it! For your ${input.roomLabel}, I can see:\n\n${itemList}${moreItems}\n\nAdded ~${input.addedCubicFeet.toFixed(1)} cu ft, ~${input.addedWeightKg.toFixed(1)} kg to your move total.${dupNote}\n\nIf I've filed this under the wrong room, just tell me, for example "this is the master bedroom".\n\nSend another room's photo or video anytime, or tap "Get My Move Total" to see everything so far.`;
}
