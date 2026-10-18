/**
 * Intake routes for lead ingestion from external sources
 */

import { Router } from "express";
import { createIndiaMartHandler } from "../intake/indiamart-handler.js";
import { ingestIndiaMartEvent, recordIntakeReject } from "../leads/ingest-db.js";
import { createPostIngestHook } from "../intake/post-ingest.js";
import { prefillEnquiry } from "../leads/prefill.js";
import { PREFILL_FIELDS, createPrefillDeps } from "../leads/prefill-db.js";

const router = Router();

const handler = createIndiaMartHandler({
  expectedToken: process.env.INDIAMART_PUSH_TOKEN,
  ingest: ingestIndiaMartEvent,
  recordReject: recordIntakeReject,
  onIngested: createPostIngestHook({
    prefill: (leadId, text) =>
      prefillEnquiry({ leadId, text, allowed: PREFILL_FIELDS }, createPrefillDeps()),
  }),
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
