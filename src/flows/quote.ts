/**
 * Move quote generation for a lead
 * 
 * Groups captures by room (room_key + qualifier for new captures,
 * normalized label for legacy), aggregates items, computes totals.
 * Totals from captures are already new-items-only (alreadyCounted items
 * excluded at capture time). Items marked alreadyCounted are hidden from
 * the displayed item list.
 */

import { getMediaCapturesForLead } from "../leads/repository.js";
import { buildMoveQuoteFromRows } from "./quote-build.js";

export type { MoveQuote } from "./quote-build.js";

export async function generateMoveQuote(leadId: string) {
  const captures = await getMediaCapturesForLead(leadId);
  return buildMoveQuoteFromRows(captures);
}
