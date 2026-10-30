/**
 * Automation API - pure, with injected dependencies
 */

import type { AutomationConfig } from "./config.js";
import { planFollowups, isExpired, type FollowupSnapshot, ACTION_KINDS } from "./rules.js";
import { KIND_LABELS } from "./messages.js";
import type { ApiResponse } from "../outreach/http.js";

export interface HistoryRow {
  id: string;
  kind: string;
  status: string;
  reason: string | null;
  channel: string | null;
  templateName: string | null;
  dueAt: Date | string;
  processedAt: Date | string | null;
}

export interface AutomationApiDeps {
  getConfig(): AutomationConfig;
  loadSnapshot(leadId: string): Promise<FollowupSnapshot | null>;
  listHistory(leadId: string): Promise<HistoryRow[]>;
  insertCancelled(a: { leadId: string; kind: string; ref: string; dueAt: Date; reason: string }): Promise<"inserted" | "exists">;
  now(): Date;
}

export function createAutomationApi(deps: AutomationApiDeps) {
  async function getAutomation(leadId: string): Promise<ApiResponse> {
    const snapshot = await deps.loadSnapshot(leadId);
    if (!snapshot) {
      return {
        status: 404,
        json: { ok: false, code: "not_found" },
      };
    }

    const cfg = deps.getConfig();
    const now = deps.now();
    const planned = planFollowups(snapshot, cfg, now);

    const upcoming = planned
      .filter(a => a.forceSkip === null && !isExpired(a, now))
      .map(a => ({
        kind: a.kind,
        ref: a.ref,
        label: KIND_LABELS[a.kind],
        dueAt: a.dueAt.toISOString(),
        expiresAt: a.expiresAt.toISOString(),
      }));

    const historyRows = await deps.listHistory(leadId);
    const history = historyRows.map(row => ({
      id: row.id,
      kind: row.kind,
      label: KIND_LABELS[row.kind as keyof typeof KIND_LABELS] ?? row.kind,
      status: row.status,
      reason: row.reason,
      channel: row.channel,
      templateName: row.templateName,
      dueAt: typeof row.dueAt === "string" ? row.dueAt : row.dueAt.toISOString(),
      processedAt: row.processedAt === null ? null : (typeof row.processedAt === "string" ? row.processedAt : row.processedAt.toISOString()),
    }));

    return {
      status: 200,
      json: {
        ok: true,
        enabled: cfg.enabled,
        dryRun: cfg.dryRun,
        upcoming,
        history,
      },
    };
  }

  async function cancelAction(leadId: string, body: unknown): Promise<ApiResponse> {
    if (typeof body !== "object" || body === null) {
      return {
        status: 400,
        json: { ok: false, code: "invalid" },
      };
    }

    const obj = body as Record<string, unknown>;

    if (typeof obj.kind !== "string" || !ACTION_KINDS.includes(obj.kind as any)) {
      return {
        status: 400,
        json: { ok: false, code: "invalid" },
      };
    }

    if (typeof obj.ref !== "string" || obj.ref.length === 0 || obj.ref.length > 200) {
      return {
        status: 400,
        json: { ok: false, code: "invalid" },
      };
    }

    let staff: string | null = null;
    if (obj.staff !== undefined && obj.staff !== null) {
      if (typeof obj.staff !== "string") {
        return {
          status: 400,
          json: { ok: false, code: "invalid" },
        };
      }
      const trimmed = obj.staff.trim().replace(/\s+/g, " ");
      if (trimmed.length > 0 && trimmed.length <= 80) {
        staff = trimmed;
      }
    }

    const snapshot = await deps.loadSnapshot(leadId);
    if (!snapshot) {
      return {
        status: 404,
        json: { ok: false, code: "not_found" },
      };
    }

    const cfg = deps.getConfig();
    const now = deps.now();
    const planned = planFollowups(snapshot, cfg, now);

    const exists = planned.some(a => a.kind === obj.kind && a.ref === obj.ref);
    if (!exists) {
      return {
        status: 409,
        json: { ok: false, code: "not_cancellable" },
      };
    }

    const action = planned.find(a => a.kind === obj.kind && a.ref === obj.ref)!;
    const reason = staff ? `cancelled by ${staff}` : "cancelled by staff";

    const result = await deps.insertCancelled({
      leadId,
      kind: obj.kind,
      ref: obj.ref,
      dueAt: action.dueAt,
      reason,
    });

    if (result === "exists") {
      return {
        status: 409,
        json: { ok: false, code: "already_processed" },
      };
    }

    return {
      status: 200,
      json: { ok: true },
    };
  }

  return { getAutomation, cancelAction };
}
