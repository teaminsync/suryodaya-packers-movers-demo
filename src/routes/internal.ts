/**
 * Internal API for the (future) admin dashboard - server-to-server only,
 * protected by a shared secret, never exposed to or called from a browser.
 */

import { Router, Request, Response, NextFunction } from "express";

const router = Router();

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

export default router;
