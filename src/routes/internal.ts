/**
 * Internal API for the (future) admin dashboard - server-to-server only,
 * protected by a shared secret, never exposed to or called from a browser.
 */

import { Router, Request, Response, NextFunction } from "express";
import { createOutreachApi } from "../outreach/api.js";
import { outreachApiDeps } from "../outreach/service-db.js";
import { createSurveySettingsApi } from "../calendar/settings-api.js";
import {
  surveyConfigProvider,
  saveSurveySettings,
  resetSurveySettings,
} from "../calendar/settings-db.js";

const router = Router();
const outreachApi = createOutreachApi(outreachApiDeps);
const surveySettingsApi = createSurveySettingsApi({
  getEffective: () => surveyConfigProvider.get(),
  save: saveSurveySettings,
  reset: resetSurveySettings,
  invalidate: () => surveyConfigProvider.invalidate(),
});

function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[Internal API] INTERNAL_API_SECRET not configured");
    res.sendStatus(500);
    return;
  }

  const provided = req.header("X-Internal-Secret");
  if (provided !== secret) {
    res.sendStatus(401);
    return;
  }

  next();
}

router.use(requireInternalSecret);

router.post("/leads/:id/send-message", async (req: Request, res: Response) => {
  try {
    const { createMessage, findLeadById } = await import("../leads/repository.js");
    const { whatsappClient } = await import("../whatsapp/client.js");
    const { instagramClient } = await import("../instagram/client.js");
    const { findIdentityExternalId } = await import("../leads/contacts.js");
    const { lastInstagramInboundAt } = await import("../instagram/handler-db.js");
    const { isServiceWindowOpen } = await import("../outreach/policy.js");

    const leadId = req.params.id as string;
    const { text } = req.body as { text?: string };

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const lead = await findLeadById(leadId);
    if (!lead) {
      res.status(404).json({ error: "lead not found" });
      return;
    }

    if (lead.source === "instagram") {
      if (!lead.contact_id) {
        res.status(409).json({ error: "no_instagram_identity" });
        return;
      }

      const igsid = await findIdentityExternalId(lead.contact_id, "instagram");
      if (!igsid) {
        res.status(409).json({ error: "no_instagram_identity" });
        return;
      }

      const lastInboundAt = await lastInstagramInboundAt(lead.contact_id);
      if (!isServiceWindowOpen(lastInboundAt, new Date())) {
        res.status(409).json({
          error: "window_closed",
          message: "The customer last wrote more than 24 hours ago, so Instagram does not allow a reply.",
        });
        return;
      }

      await instagramClient.sendText(igsid, text);

      await createMessage({
        leadId,
        wamid: null,
        direction: "outbound",
        senderType: "human",
        messageType: "text",
        body: text,
        channel: "instagram",
      });

      res.json({ success: true });
      return;
    }

    await whatsappClient.sendMessage(lead.whatsapp_number, text);

    await createMessage({
      leadId,
      wamid: null,
      direction: "outbound",
      senderType: "human",
      messageType: "text",
      body: text,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[Internal API] send-message failed:", error);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/leads/:id/takeover", async (req: Request, res: Response) => {
  try {
    const { setHumanTakeover } = await import("../leads/repository.js");

    const leadId = req.params.id as string;
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }

    await setHumanTakeover(leadId, enabled);

    res.json({ success: true, enabled });
  } catch (error) {
    console.error("[Internal API] takeover toggle failed:", error);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/leads/:id/quote", async (req: Request, res: Response) => {
  try {
    const { generateMoveQuote } = await import("../flows/quote.js");

    const leadId = req.params.id as string;
    const quote = await generateMoveQuote(leadId);

    res.json(quote);
  } catch (error) {
    console.error("[Internal API] quote fetch failed:", error);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/leads/:id/outreach", async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const r = await outreachApi.getStatus(leadId);
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Outreach request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/leads/:id/outreach/consent", async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const r = await outreachApi.postConsent(leadId, req.body);
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Outreach request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/leads/:id/outreach/followup", async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const r = await outreachApi.postFollowup(leadId);
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Outreach request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/survey-settings", async (_req: Request, res: Response) => {
  try {
    const r = await surveySettingsApi.getSettings();
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Survey settings request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

router.put("/survey-settings", async (req: Request, res: Response) => {
  try {
    const r = await surveySettingsApi.putSettings(req.body);
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Survey settings request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/survey-settings/reset", async (_req: Request, res: Response) => {
  try {
    const r = await surveySettingsApi.resetSettings();
    res.status(r.status).json(r.json);
  } catch (error) {
    console.error(
      "[Internal] Survey settings request failed:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
