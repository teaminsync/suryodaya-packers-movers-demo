/**
 * Follow-up scheduler - pure orchestration with injected dependencies
 */

import { planFollowups, isExpired, missingDetailLabels, type FollowupSnapshot } from "./rules.js";
import { decideOutreach, isServiceWindowOpen } from "../outreach/policy.js";
import type { AutomationConfig } from "./config.js";
import {
  buildNudgeText,
  buildNudgeTemplate,
  buildMissingDetailsText,
  buildReminderText,
  buildReminderTemplate,
  buildMorningText,
} from "./messages.js";

export interface SchedulerDeps {
  now(): Date;
  config: AutomationConfig;
  listCandidateLeadIds(): Promise<string[]>;
  loadSnapshot(leadId: string): Promise<FollowupSnapshot | null>;
  countSentToday(now: Date): Promise<number>;
  claim(a: { leadId: string; kind: string; ref: string; dueAt: Date }): Promise<boolean>;
  recordSkipped(a: { leadId: string; kind: string; ref: string; dueAt: Date; reason: string }): Promise<void>;
  markSent(a: { leadId: string; kind: string; ref: string; channel: "freeform" | "template"; templateName: string | null; wamid: string | null }): Promise<void>;
  markFailed(a: { leadId: string; kind: string; ref: string; error: string }): Promise<void>;
  sendFreeform(a: { leadId: string; to: string; text: string }): Promise<{ wamid: string | null }>;
  sendTemplate(a: { leadId: string; to: string; templateName: string; languageCode: string; bodyParams: string[]; buttonPayloads: string[]; renderedText: string }): Promise<{ wamid: string | null }>;
  log(message: string, detail?: unknown): void;
}

const dryRunSeen = new Set<string>();
const expiredSeen = new Set<string>();

export async function runFollowupTick(deps: SchedulerDeps): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  stoppedByCap: boolean;
  dryRun: number;
}> {
  if (!deps.config.enabled) {
    return { considered: 0, sent: 0, skipped: 0, failed: 0, stoppedByCap: false, dryRun: 0 };
  }

  const now = deps.now();
  let sentToday = await deps.countSentToday(now);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let dryRunCount = 0;
  let stoppedByCap = false;

  const candidates = await deps.listCandidateLeadIds();

  for (const leadId of candidates) {
    try {
      const snapshot = await deps.loadSnapshot(leadId);
      if (!snapshot) {
        continue;
      }

      const actions = planFollowups(snapshot, deps.config, now).filter(a => a.dueAt.getTime() <= now.getTime());

      for (const action of actions) {
        try {
          // Check expiry
          if (isExpired(action, now)) {
            const key = `${leadId}|${action.kind}|${action.ref}`;
            if (!expiredSeen.has(key)) {
              deps.log("[Followups] expired, not sent", { leadId, kind: action.kind, ref: action.ref });
              expiredSeen.add(key);
            }
            continue;
          }

          // Check forceSkip
          if (action.forceSkip) {
            await deps.recordSkipped({ leadId, kind: action.kind, ref: action.ref, dueAt: action.dueAt, reason: action.forceSkip });
            skipped++;
            continue;
          }

          // Decide outreach channel
          const windowOpen = isServiceWindowOpen(snapshot.lastInboundAt, now);
          const decision = decideOutreach({
            phoneE164: snapshot.contact.phoneE164,
            consent: snapshot.consent,
            windowOpen,
          });

          // Map required channel by kind
          let requiredChannel: "freeform" | "template" | null = null;
          if (action.kind === "nudge_inwindow" || action.kind === "missing_details" || action.kind === "survey_morning") {
            requiredChannel = "freeform";
          } else if (action.kind === "nudge_template") {
            requiredChannel = "template";
          } else if (action.kind === "survey_reminder") {
            requiredChannel = decision.action === "reply_freeform" ? "freeform" : (decision.action === "send_template" ? "template" : null);
          }

          // Check if the decision matches the required channel
          let skipReason: string | null = null;

          if (decision.action === "blocked_opted_out") {
            skipReason = "opted_out";
          } else if (decision.action === "needs_human_call") {
            skipReason = "no_phone";
          } else if (decision.action === "offer_click_to_chat") {
            skipReason = "no_consent";
          } else if (requiredChannel === "freeform" && decision.action !== "reply_freeform") {
            skipReason = "window_closed";
          } else if (requiredChannel === "template" && decision.action !== "send_template") {
            skipReason = "window_open";
          }

          if (skipReason) {
            await deps.recordSkipped({ leadId, kind: action.kind, ref: action.ref, dueAt: action.dueAt, reason: skipReason });
            skipped++;
            continue;
          }

          // Check daily cap
          if (sentToday >= deps.config.dailyCap) {
            stoppedByCap = true;
            return { considered: candidates.length, sent, skipped, failed, stoppedByCap, dryRun: dryRunCount };
          }

          // Dry run
          if (deps.config.dryRun) {
            const key = `${leadId}|${action.kind}|${action.ref}`;
            if (!dryRunSeen.has(key)) {
              deps.log("[Followups] DRY RUN would send", { leadId, kind: action.kind, channel: requiredChannel });
              dryRunSeen.add(key);
            }
            dryRunCount++;
            continue;
          }

          // Claim
          const claimed = await deps.claim({ leadId, kind: action.kind, ref: action.ref, dueAt: action.dueAt });
          if (!claimed) {
            continue;
          }

          // Build content
          const phone = snapshot.contact.phoneE164 ?? "";
          const to = phone.replace(/\D/g, "");
          const contactName = snapshot.contact.displayName;

          try {
            let wamid: string | null = null;
            let templateName: string | null = null;
            let channel: "freeform" | "template";

            if (requiredChannel === "freeform") {
              channel = "freeform";
              let text: string;

              if (action.kind === "nudge_inwindow") {
                text = buildNudgeText({ contactName, origin: snapshot.lead.origin, destination: snapshot.lead.destination });
              } else if (action.kind === "missing_details") {
                const labels = missingDetailLabels(snapshot.lead);
                text = buildMissingDetailsText({ contactName, labels });
              } else if (action.kind === "survey_reminder") {
                if (!snapshot.booking) {
                  throw new Error("survey_reminder requires booking");
                }
                text = buildReminderText({ contactName, startsAt: new Date(snapshot.booking.startsAt) });
              } else if (action.kind === "survey_morning") {
                if (!snapshot.booking) {
                  throw new Error("survey_morning requires booking");
                }
                text = buildMorningText({ contactName, startsAt: new Date(snapshot.booking.startsAt) });
              } else {
                throw new Error(`Unknown action kind for freeform: ${action.kind}`);
              }

              const result = await deps.sendFreeform({ leadId, to, text });
              wamid = result.wamid;
            } else if (requiredChannel === "template") {
              channel = "template";

              if (action.kind === "nudge_template") {
                const tmpl = buildNudgeTemplate({ contactName, origin: snapshot.lead.origin, destination: snapshot.lead.destination });
                templateName = tmpl.templateName;
                const result = await deps.sendTemplate({
                  leadId,
                  to,
                  templateName: tmpl.templateName,
                  languageCode: tmpl.languageCode,
                  bodyParams: tmpl.bodyParams,
                  buttonPayloads: tmpl.buttonPayloads,
                  renderedText: tmpl.renderedText,
                });
                wamid = result.wamid;
              } else if (action.kind === "survey_reminder") {
                if (!snapshot.booking) {
                  throw new Error("survey_reminder requires booking");
                }
                const tmpl = buildReminderTemplate({ contactName, startsAt: new Date(snapshot.booking.startsAt) });
                templateName = tmpl.templateName;
                const result = await deps.sendTemplate({
                  leadId,
                  to,
                  templateName: tmpl.templateName,
                  languageCode: tmpl.languageCode,
                  bodyParams: tmpl.bodyParams,
                  buttonPayloads: tmpl.buttonPayloads,
                  renderedText: tmpl.renderedText,
                });
                wamid = result.wamid;
              } else {
                throw new Error(`Unknown action kind for template: ${action.kind}`);
              }
            } else {
              throw new Error(`No required channel for action kind: ${action.kind}`);
            }

            await deps.markSent({ leadId, kind: action.kind, ref: action.ref, channel, templateName, wamid });
            sent++;
            sentToday++;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            const truncated = msg.slice(0, 200);
            await deps.markFailed({ leadId, kind: action.kind, ref: action.ref, error: truncated });
            failed++;
          }
        } catch (error) {
          deps.log("[Followups] Action processing failed:", { leadId, kind: action.kind, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      deps.log("[Followups] Lead processing failed:", { leadId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { considered: candidates.length, sent, skipped, failed, stoppedByCap, dryRun: dryRunCount };
}
