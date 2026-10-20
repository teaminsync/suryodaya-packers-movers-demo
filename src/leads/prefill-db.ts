/**
 * Database wiring for prefill
 */

import { findLeadById, mergeLeadFields } from "./repository.js";
import { processConversationTurn } from "../flows/qualification.js";
import { normalizeExtractedKeys } from "./prefill.js";
import type { PrefillDeps } from "./prefill.js";

export const PREFILL_FIELDS: readonly string[] = [
  "origin",
  "destination",
  "move_type",
  "urgency",
  "estimated_volume",
];

export function createPrefillDeps(): PrefillDeps {
  let rememberedProvider: string | undefined;
  let rememberedFailover: boolean | undefined;

  return {
    async getLeadFields(leadId: string) {
      const lead = await findLeadById(leadId);
      if (!lead) {
        return undefined;
      }

      return {
        origin: lead.origin,
        destination: lead.destination,
        move_type: lead.move_type,
        urgency: lead.urgency,
        estimated_volume: lead.estimated_volume,
        has_special_items: lead.has_special_items,
        special_items: lead.special_items,
        requires_packing: lead.requires_packing,
      };
    },

    async extractFields(text: string) {
      let turnResult;
      try {
        turnResult = await processConversationTurn(text, {});
      } catch {
        return null;
      }

      rememberedProvider = turnResult.providerUsed;
      rememberedFailover = turnResult.wasFailover;

      if (!turnResult.data || !turnResult.data.extractedFields) {
        return null;
      }

      return normalizeExtractedKeys(turnResult.data.extractedFields as Record<string, unknown>);
    },

    async applyFields(leadId: string, fields: Record<string, string>) {
      const fieldsToMerge: Partial<{
        moveType: string;
        origin: string;
        destination: string;
        urgency: string;
        hasSpecialItems: boolean;
        specialItems: string[];
        estimatedVolume: string;
        requiresPacking: boolean;
      }> = {};

      if (fields.origin) fieldsToMerge.origin = fields.origin;
      if (fields.destination) fieldsToMerge.destination = fields.destination;
      if (fields.move_type) fieldsToMerge.moveType = fields.move_type;
      if (fields.urgency) fieldsToMerge.urgency = fields.urgency;
      if (fields.estimated_volume) fieldsToMerge.estimatedVolume = fields.estimated_volume;

      await mergeLeadFields(
        leadId,
        fieldsToMerge,
        rememberedProvider,
        rememberedFailover
      );
    },

    async applySpecialItems(leadId: string, items: string[]) {
      await mergeLeadFields(
        leadId,
        { hasSpecialItems: true, specialItems: items },
        rememberedProvider,
        rememberedFailover
      );
    },
  };
}
