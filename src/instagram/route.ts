/**
 * Instagram webhook routes
 */

import { Router, Request, Response } from "express";
import { verifySubscription, verifyInstagramSignature } from "./verify.js";
import { parseInstagramPayload } from "./parse.js";
import { handleInstagramMessage } from "./handler.js";
import { instagramDeps } from "./handler-db.js";
import { createKeyedQueue } from "./keyed-queue.js";

const enqueue = createKeyedQueue();

export const instagramRoutes = Router();

instagramRoutes.get("/", (req: Request, res: Response) => {
  const r = verifySubscription(req.query, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);

  if (r.ok) {
    res.status(200).type("text/plain").send(r.challenge);
  } else {
    res.sendStatus(403);
  }
});

instagramRoutes.post("/", (req: Request, res: Response) => {
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.header("x-hub-signature-256");

  const ok = verifyInstagramSignature(rawBody, signature, [
    process.env.INSTAGRAM_APP_SECRET,
    process.env.INSTAGRAM_APP_SECRET_ALT,
  ]);

  if (!ok) {
    console.warn("[Instagram] Signature check failed");
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);

  const parsed = parseInstagramPayload(req.body, process.env.INSTAGRAM_ACCOUNT_ID);

  for (const event of parsed.events) {
    enqueue(event.igsid, () => handleInstagramMessage(event, instagramDeps, new Date()))
      .then((r) => {
        console.log("[Instagram] Message handled:", { status: r.status });
      })
      .catch((error) => {
        console.error(
          "[Instagram] Message processing failed:",
          error instanceof Error ? error.message : String(error)
        );
      });
  }
});
