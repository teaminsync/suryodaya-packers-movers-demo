/**
 * Transport-independent handler for IndiaMART Push API
 */

import { createHash, timingSafeEqual } from "crypto";
import { parseIndiaMartPush, INDIAMART_SOURCE } from "./indiamart.js";
import type { InquiryEvent } from "./types.js";

export interface IndiaMartIngestSummary {
  duplicate: boolean;
  createdEnquiry?: boolean;
  reason: string;
  leadId?: string;
}

export interface IndiaMartHandlerDeps {
  expectedToken: string | undefined;
  ingest(event: InquiryEvent, now: Date): Promise<IndiaMartIngestSummary>;
  recordReject(params: { source: string; reason: string; rawPayload: string }): Promise<void>;
  now?: () => Date;
}

export interface IndiaMartHandlerResponse {
  status: number;
  json: Record<string, unknown>;
}

export function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function createIndiaMartHandler(
  deps: IndiaMartHandlerDeps
): (token: string, body: unknown) => Promise<IndiaMartHandlerResponse> {
  const inFlight = new Map<string, Promise<unknown>>();

  return async (token: string, body: unknown): Promise<IndiaMartHandlerResponse> => {
    // Token check
    if (!deps.expectedToken || !tokensMatch(token, deps.expectedToken)) {
      console.warn("[Intake] IndiaMART request rejected: unknown or missing token");
      return { status: 404, json: { error: "not found" } };
    }

    const now = (deps.now ?? (() => new Date()))();

    // Parse
    const parsed = parseIndiaMartPush(body, now);

    // Handle unparseable
    if (!parsed.ok) {
      let raw: string;
      try {
        const serialized = JSON.stringify(body);
        raw = serialized === undefined ? "[unserialisable]" : serialized;
      } catch {
        raw = "[unserialisable]";
      }
      raw = raw.slice(0, 50000);

      try {
        await deps.recordReject({
          source: INDIAMART_SOURCE,
          reason: parsed.reason,
          rawPayload: raw,
        });
      } catch (error) {
        console.error(
          "[Intake] Could not record rejected IndiaMART payload:",
          error instanceof Error ? error.message : String(error)
        );
        return { status: 500, json: { error: "internal error" } };
      }

      console.warn("[Intake] IndiaMART payload ignored:", parsed.reason);
      return { status: 200, json: { code: 200, status: "ignored" } };
    }

    // Serialize ingestion by external ref
    const event = parsed.event;
    const key = event.source + ":" + event.externalRef;
    const prev = inFlight.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => deps.ingest(event, now));
    inFlight.set(key, run);

    let summary: IndiaMartIngestSummary;
    try {
      summary = await run;
    } catch (error) {
      console.error(
        "[Intake] IndiaMART ingestion failed:",
        error instanceof Error ? error.message : String(error)
      );
      return { status: 500, json: { error: "internal error" } };
    } finally {
      if (inFlight.get(key) === run) {
        inFlight.delete(key);
      }
    }

    // Respond
    if (summary.duplicate) {
      return { status: 200, json: { code: 200, status: "duplicate" } };
    }

    console.info("[Intake] IndiaMART lead ingested", {
      leadId: summary.leadId,
      createdEnquiry: summary.createdEnquiry,
      reason: summary.reason,
      queryType: event.queryType,
    });

    return { status: 200, json: { code: 200, status: "success" } };
  };
}
