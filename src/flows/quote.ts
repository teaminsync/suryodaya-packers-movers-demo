/**
 * Aggregates all media_captures for a lead into one provisional move quote.
 * Deterministic formatting only - no AI call, since this just summarizes data
 * we already have from the AI analysis done at capture time.
 *
 * Grouping is intentionally LIGHT: captures are grouped for display purely by
 * case/whitespace-insensitive matching on suggested_room_label (so "Bedroom"
 * and "bedroom" show under one heading). This is NOT semantic room matching
 * (won't catch "Master Bedroom" vs "bedroom" as related) and items within a
 * group are never merged - three separate sofa captures show as three
 * separate line items, not "sofa (3)". Real grouping intelligence is
 * out of scope for this step.
 */

import { getMediaCapturesForLead } from "../leads/repository.js";
import { formatRoomLabel } from "../utils/text.js";

interface QuoteItem {
  name: string;
  quantity: number;
}

export interface MoveQuote {
  hasCaptures: boolean;
  roomCount: number;
  captureCount: number;
  totalEstimatedCubicFeet: number;
  totalEstimatedWeightKg: number;
  message: string;
}

export async function generateMoveQuote(leadId: string): Promise<MoveQuote> {
  const captures = await getMediaCapturesForLead(leadId);

  if (captures.length === 0) {
    return {
      hasCaptures: false,
      roomCount: 0,
      captureCount: 0,
      totalEstimatedCubicFeet: 0,
      totalEstimatedWeightKg: 0,
      message:
        "You haven't sent any room photos or videos yet! Send a short video " +
        "or photo of each room and I'll build up your move estimate as you go.",
    };
  }

  // Group by normalized room label (case/whitespace-insensitive only)
  const groups = new Map<
    string,
    { displayLabel: string; captures: typeof captures }
  >();

  for (const capture of captures) {
    const rawLabel = capture.suggested_room_label?.trim() || "Unlabeled";
    const key = formatRoomLabel(rawLabel).toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { displayLabel: formatRoomLabel(rawLabel), captures: [] });
    }
    groups.get(key)!.captures.push(capture);
  }

  let totalCubicFeet = 0;
  let totalWeightKg = 0;
  const sections: string[] = [];

  for (const { displayLabel, captures: groupCaptures } of groups.values()) {
    let groupCubicFeet = 0;
    let groupWeightKg = 0;
    const itemLines: string[] = [];

    for (const capture of groupCaptures) {
      groupCubicFeet += capture.total_estimated_cubic_feet;
      groupWeightKg += capture.total_estimated_weight_kg;

      const items: QuoteItem[] = JSON.parse(capture.items);
      for (const item of items) {
        itemLines.push(`• ${item.name} (${item.quantity})`);
      }
    }

    totalCubicFeet += groupCubicFeet;
    totalWeightKg += groupWeightKg;

    sections.push(
      `*${displayLabel}* (${groupCaptures.length} capture${groupCaptures.length > 1 ? "s" : ""})\n` +
        itemLines.join("\n") +
        `\nSubtotal: ~${groupCubicFeet.toFixed(1)} cu ft, ~${groupWeightKg.toFixed(1)} kg`
    );
  }

  const message =
    `📋 *Your Move Estimate (Provisional)*\n\n` +
    sections.join("\n\n") +
    `\n\n━━━━━━━━━━━━━━━\n` +
    `📦 *Total: ~${totalCubicFeet.toFixed(1)} cu ft, ~${totalWeightKg.toFixed(1)} kg*\n` +
    `📸 Based on ${captures.length} photo/video capture${captures.length > 1 ? "s" : ""} across ${groups.size} room${groups.size > 1 ? "s" : ""}\n\n` +
    `This is a provisional AI estimate based on what you've shared. An on-site ` +
    `survey confirms the final quote. Tap "Book a Survey" when you're ready, or ` +
    `keep sending more rooms if you're not done yet.`;

  return {
    hasCaptures: true,
    roomCount: groups.size,
    captureCount: captures.length,
    totalEstimatedCubicFeet: Math.round(totalCubicFeet * 10) / 10,
    totalEstimatedWeightKg: Math.round(totalWeightKg * 10) / 10,
    message,
  };
}
