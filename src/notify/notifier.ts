/**
 * Core notifier logic - sends admin alerts by email and WhatsApp
 */

import type { AdminEvent, AdminEventType } from "./types.js";
import { buildEmail, buildTemplateParams } from "./format.js";
import { NOTIFY_DEDUPE_MINUTES } from "./dedupe.js";

export interface NotifierDeps {
  emailConfig: { apiKey: string; to: string; from: string } | null;
  whatsappConfig: { to: string; template: string } | null;
  dashboardBaseUrl: string | null;
  dryRun: boolean;
  now(): Date;
  sendEmail(input: {
    apiKey: string;
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<void>;
  sendWhatsappTemplate(input: {
    to: string;
    templateName: string;
    languageCode: string;
    bodyParams: string[];
  }): Promise<void>;
  recentlySent(
    leadId: string,
    type: AdminEventType,
    since: Date
  ): Promise<boolean>;
  record(row: {
    leadId: string;
    eventType: AdminEventType;
    channel: "email" | "whatsapp";
    status: "sent" | "failed" | "dry_run";
    detail: string | null;
  }): Promise<void>;
}

export function createNotifier(deps: NotifierDeps) {
  return {
    async notify(event: AdminEvent): Promise<void> {
      const hasEmail = deps.emailConfig !== null;
      const hasWhatsapp = deps.whatsappConfig !== null;

      if (!hasEmail && !hasWhatsapp) {
        console.log("[Notify] No admin channel configured");
        return;
      }

      let shouldSkip = false;
      try {
        const since = new Date(deps.now().getTime() - NOTIFY_DEDUPE_MINUTES * 60 * 1000);
        shouldSkip = await deps.recentlySent(event.leadId, event.type, since);
      } catch (error) {
        console.log(
          "[Notify] Dedupe check failed, sending anyway:",
          error instanceof Error ? error.message : String(error)
        );
      }

      if (shouldSkip) {
        console.log(
          `[Notify] Skipping ${event.type} for lead ${event.leadId} - already sent recently`
        );
        return;
      }

      if (deps.dryRun) {
        const { subject } = buildEmail(event, deps.dashboardBaseUrl);
        console.log(`[Notify] DRY RUN: ${subject}`);

        if (hasEmail) {
          try {
            await deps.record({
              leadId: event.leadId,
              eventType: event.type,
              channel: "email",
              status: "dry_run",
              detail: null,
            });
          } catch {}
        }

        if (hasWhatsapp) {
          try {
            await deps.record({
              leadId: event.leadId,
              eventType: event.type,
              channel: "whatsapp",
              status: "dry_run",
              detail: null,
            });
          } catch {}
        }

        return;
      }

      const tasks: Promise<void>[] = [];

      if (hasEmail) {
        tasks.push(
          (async () => {
            try {
              const { subject, text } = buildEmail(event, deps.dashboardBaseUrl);
              await deps.sendEmail({
                apiKey: deps.emailConfig!.apiKey,
                from: deps.emailConfig!.from,
                to: deps.emailConfig!.to,
                subject,
                text,
              });

              try {
                await deps.record({
                  leadId: event.leadId,
                  eventType: event.type,
                  channel: "email",
                  status: "sent",
                  detail: null,
                });
              } catch {}
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.log(`[Notify] Email send failed:`, message);
              try {
                await deps.record({
                  leadId: event.leadId,
                  eventType: event.type,
                  channel: "email",
                  status: "failed",
                  detail: message.substring(0, 200),
                });
              } catch {}
            }
          })()
        );
      }

      if (hasWhatsapp) {
        tasks.push(
          (async () => {
            try {
              const params = buildTemplateParams(event);
              await deps.sendWhatsappTemplate({
                to: deps.whatsappConfig!.to,
                templateName: deps.whatsappConfig!.template,
                languageCode: "en",
                bodyParams: params,
              });

              try {
                await deps.record({
                  leadId: event.leadId,
                  eventType: event.type,
                  channel: "whatsapp",
                  status: "sent",
                  detail: null,
                });
              } catch {}
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.log(`[Notify] WhatsApp send failed:`, message);
              try {
                await deps.record({
                  leadId: event.leadId,
                  eventType: event.type,
                  channel: "whatsapp",
                  status: "failed",
                  detail: message.substring(0, 200),
                });
              } catch {}
            }
          })()
        );
      }

      await Promise.allSettled(tasks);
    },
  };
}
