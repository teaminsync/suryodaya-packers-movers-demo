/**
 * Move quote building logic (pure, no database dependencies)
 * Groups captures by room, aggregates items, formats display message
 */

import { formatRoomLabel } from "../utils/text.js";

export interface QuoteCaptureRow {
  suggested_room_label: string | null;
  room_key: string | null;
  room_qualifier: string | null;
  items: string;
  total_estimated_cubic_feet: number;
  total_estimated_weight_kg: number;
}

interface QuoteItem {
  name: string;
  quantity: number;
  alreadyCounted?: boolean;
}

export interface MoveQuote {
  hasCaptures: boolean;
  roomCount: number;
  captureCount: number;
  totalEstimatedCubicFeet: number;
  totalEstimatedWeightKg: number;
  message: string;
}

export function buildMoveQuoteFromRows(
  captures: QuoteCaptureRow[]
): MoveQuote {
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

  // Group by: room_key + qualifier for new captures, normalized label for legacy
  const groups = new Map<
    string,
    { displayLabel: string; captures: QuoteCaptureRow[] }
  >();

  for (const capture of captures) {
    let key: string;
    let displayLabel: string;

    if (capture.room_key !== null) {
      // New-style capture: group by room_key + qualifier
      key = `${capture.room_key}|${capture.room_qualifier ?? ""}`;
      displayLabel = formatRoomLabel(
        capture.suggested_room_label || "Unlabeled"
      );
    } else {
      // Legacy capture: group by normalized label
      const rawLabel = capture.suggested_room_label?.trim() || "Unlabeled";
      key = `legacy|${formatRoomLabel(rawLabel).toLowerCase()}`;
      displayLabel = formatRoomLabel(rawLabel);
    }

    if (!groups.has(key)) {
      groups.set(key, { displayLabel, captures: [] });
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
      // Totals from captures (already new-items-only)
      groupCubicFeet += capture.total_estimated_cubic_feet;
      groupWeightKg += capture.total_estimated_weight_kg;

      // Parse items and skip alreadyCounted lines
      let items: QuoteItem[];
      try {
        items = JSON.parse(capture.items);
      } catch {
        // Bad JSON: contribute zero items but totals still count
        continue;
      }

      for (const item of items) {
        if (item.alreadyCounted === true) {
          continue;
        }
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
