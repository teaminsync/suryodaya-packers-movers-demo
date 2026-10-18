/**
 * API orchestration for outreach endpoints
 */

import { getOutreachStatus, sendFollowup, recordStaffConsent } from "./service.js";
import {
  describeOutreach,
  buildStaffNote,
  mapConsentResult,
  mapFollowupResult,
} from "./http.js";
import type { OutreachDeps } from "./service.js";
import type { ApiResponse } from "./http.js";

export interface ConsentHistoryRow {
  status: string;
  source: string;
  wording: string | null;
  captured_at: string | Date;
}

export type OutreachApiDeps = OutreachDeps & {
  getConsentHistory(contactId: string): Promise<ConsentHistoryRow[]>;
};

export interface OutreachApi {
  getStatus(leadId: string): Promise<ApiResponse>;
  postConsent(leadId: string, body: unknown): Promise<ApiResponse>;
  postFollowup(leadId: string): Promise<ApiResponse>;
}

function isValidDate(value: unknown): boolean {
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return !isNaN(parsed.getTime());
  }
  return false;
}

function toISOString(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

export function createOutreachApi(
  deps: OutreachApiDeps,
  now: () => Date = () => new Date()
): OutreachApi {
  return {
    async getStatus(leadId: string): Promise<ApiResponse> {
      const status = await getOutreachStatus(leadId, now(), deps);

      if (status === null) {
        return {
          status: 404,
          json: { error: "lead not found" },
        };
      }

      const lead = await deps.getLead(leadId);
      let history: Array<{
        status: string;
        source: string;
        wording: string | null;
        captured_at: string;
      }> = [];

      if (lead && lead.contact_id) {
        const rawHistory = await deps.getConsentHistory(lead.contact_id);

        history = rawHistory
          .filter((row) => isValidDate(row.captured_at))
          .map((row) => ({
            status: row.status,
            source: row.source,
            wording:
              row.wording !== null ? row.wording.slice(0, 300) : null,
            captured_at: toISOString(row.captured_at),
          }))
          .sort((a, b) => {
            const dateA = new Date(a.captured_at).getTime();
            const dateB = new Date(b.captured_at).getTime();
            return dateB - dateA;
          })
          .slice(0, 10);
      }

      return {
        status: 200,
        json: {
          status,
          capabilities: describeOutreach(status),
          history,
        },
      };
    },

    async postConsent(leadId: string, body: unknown): Promise<ApiResponse> {
      const fields =
        body !== null &&
        typeof body === "object" &&
        !Array.isArray(body)
          ? body
          : {};

      const built = buildStaffNote(
        (fields as Record<string, unknown>).note,
        (fields as Record<string, unknown>).staff
      );

      if (!built.ok) {
        return mapConsentResult({ ok: false, code: built.code });
      }

      const result = await recordStaffConsent(leadId, built.note, now(), deps);
      return mapConsentResult(result);
    },

    async postFollowup(leadId: string): Promise<ApiResponse> {
      const result = await sendFollowup(leadId, now(), deps);
      return mapFollowupResult(result);
    },
  };
}
