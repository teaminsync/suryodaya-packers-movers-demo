/**
 * Intake routes for lead ingestion from external sources
 */

import { Router } from "express";
import { createIndiaMartHandler } from "../intake/indiamart-handler.js";
import { ingestIndiaMartEvent, recordIntakeReject } from "../leads/ingest-db.js";

const router = Router();

const handler = createIndiaMartHandler({
  expectedToken: process.env.INDIAMART_PUSH_TOKEN,
  ingest: ingestIndiaMartEvent,
  recordReject: recordIntakeReject,
});

router.post("/indiamart/:token", async (req, res) => {
  try {
    const result = await handler(String(req.params.token), req.body);
    res.status(result.status).json(result.json);
  } catch (error) {
    console.error(
      "[Intake] Unexpected error in IndiaMART route:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
