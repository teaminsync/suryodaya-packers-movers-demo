/**
 * Tests for IndiaMART handler
 */

import { createIndiaMartHandler, type IndiaMartHandlerDeps, type IndiaMartIngestSummary } from "../indiamart-handler.js";
import type { InquiryEvent } from "../types.js";

const validBody = {
  CODE: 200,
  STATUS: "SUCCESS",
  RESPONSE: {
    UNIQUE_QUERY_ID: "621654886",
    QUERY_TYPE: "B",
    QUERY_TIME: "2024-04-10 11:17:14",
    SENDER_NAME: "Prabhat",
    SENDER_MOBILE: "+91-9999999999",
    QUERY_MESSAGE: "Need a 2BHK moved",
    SENDER_COUNTRY_ISO: "IN",
  },
};

interface CallRecord {
  fn: string;
  args: any[];
}

function makeHandler(overrides: Partial<IndiaMartHandlerDeps> = {}): {
  handler: (token: string, body: unknown) => Promise<any>;
  ingestEvents: InquiryEvent[];
  rejectCalls: CallRecord[];
} {
  const ingestEvents: InquiryEvent[] = [];
  const rejectCalls: CallRecord[] = [];

  const deps: IndiaMartHandlerDeps = {
    expectedToken: "secret-token-value",
    async ingest(event: InquiryEvent, now: Date): Promise<IndiaMartIngestSummary> {
      ingestEvents.push(event);
      return {
        duplicate: false,
        createdEnquiry: true,
        reason: "no_enquiry",
        leadId: "l1",
      };
    },
    async recordReject(params: { source: string; reason: string; rawPayload: string }): Promise<void> {
      rejectCalls.push({ fn: "recordReject", args: [params] });
    },
    ...overrides,
  };

  const handler = createIndiaMartHandler(deps);

  return { handler, ingestEvents, rejectCalls };
}

describe("createIndiaMartHandler", () => {
  it("rejects when expectedToken is undefined", async () => {
    const { handler, ingestEvents } = makeHandler({ expectedToken: undefined });

    const result = await handler("any-token", validBody);

    expect(result.status).toBe(404);
    expect(ingestEvents.length).toBe(0);
  });

  it("rejects wrong tokens of different and same lengths", async () => {
    const { handler, ingestEvents } = makeHandler();

    const result1 = await handler("wrong", validBody);
    expect(result1.status).toBe(404);

    const result2 = await handler("secret-token-valuX", validBody);
    expect(result2.status).toBe(404);

    expect(ingestEvents.length).toBe(0);
  });

  it("accepts correct token with valid body", async () => {
    const { handler, ingestEvents, rejectCalls } = makeHandler();

    const result = await handler("secret-token-value", validBody);

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ code: 200, status: "success" });
    expect(ingestEvents.length).toBe(1);
    expect(ingestEvents[0].externalRef).toBe("621654886");
    expect(rejectCalls.length).toBe(0);
  });

  it("ignores unparseable body and records reject", async () => {
    const { handler, ingestEvents, rejectCalls } = makeHandler();

    const result = await handler("secret-token-value", { hello: "x" });

    expect(result.status).toBe(200);
    expect(result.json.status).toBe("ignored");
    expect(rejectCalls.length).toBe(1);
    expect(rejectCalls[0].args[0]).toMatchObject({
      source: "indiamart",
      rawPayload: '{"hello":"x"}',
    });
    expect(rejectCalls[0].args[0].reason).toContain("UNIQUE_QUERY_ID");
    expect(ingestEvents.length).toBe(0);
  });

  it("returns 500 when recordReject throws", async () => {
    const { handler } = makeHandler({
      async recordReject() {
        throw new Error("Database error");
      },
    });

    const result = await handler("secret-token-value", { hello: "x" });

    expect(result.status).toBe(500);
  });

  it("returns 500 when ingest throws", async () => {
    const { handler, rejectCalls } = makeHandler({
      async ingest() {
        throw new Error("Ingestion failed");
      },
    });

    const result = await handler("secret-token-value", validBody);

    expect(result.status).toBe(500);
    expect(rejectCalls.length).toBe(0);
  });

  it("returns duplicate status when ingest reports duplicate", async () => {
    const { handler } = makeHandler({
      async ingest() {
        return { duplicate: true, reason: "duplicate" };
      },
    });

    const result = await handler("secret-token-value", validBody);

    expect(result.status).toBe(200);
    expect(result.json.status).toBe("duplicate");
  });

  it("serializes ingestion for same external ref", async () => {
    const log: string[] = [];
    let counter = 0;

    const { handler } = makeHandler({
      async ingest() {
        const n = ++counter;
        log.push(`start:${n}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        log.push(`end:${n}`);
        return { duplicate: false, createdEnquiry: true, reason: "no_enquiry", leadId: `l${n}` };
      },
    });

    await Promise.all([
      handler("secret-token-value", validBody),
      handler("secret-token-value", validBody),
    ]);

    expect(log).toEqual(["start:1", "end:1", "start:2", "end:2"]);

    // Second run with different IDs
    const log2: string[] = [];
    let counter2 = 0;

    const { handler: handler2 } = makeHandler({
      async ingest() {
        const n = ++counter2;
        log2.push(`start:${n}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        log2.push(`end:${n}`);
        return { duplicate: false, createdEnquiry: true, reason: "no_enquiry", leadId: `l${n}` };
      },
    });

    const body1 = { ...validBody, RESPONSE: { ...validBody.RESPONSE, UNIQUE_QUERY_ID: "111" } };
    const body2 = { ...validBody, RESPONSE: { ...validBody.RESPONSE, UNIQUE_QUERY_ID: "222" } };

    await Promise.all([
      handler2("secret-token-value", body1),
      handler2("secret-token-value", body2),
    ]);

    const idx1 = log2.indexOf("start:1");
    const idx2 = log2.indexOf("start:2");
    const idxEnd1 = log2.indexOf("end:1");

    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idxEnd1).toBeGreaterThan(idx2);
  });
});

describe("onIngested hook", () => {
  it("new lead", async () => {
    const hookCalls: any[] = [];
    const { handler } = makeHandler({
      onIngested: (info) => {
        hookCalls.push(info);
      },
    });

    await handler("secret-token-value", validBody);
    await new Promise((r) => setTimeout(r, 0));

    expect(hookCalls.length).toBe(1);
    expect(hookCalls[0].event.externalRef).toBe("621654886");
    expect(hookCalls[0].summary.leadId).toBe("l1");
  });

  it("the hook is NOT called when ingest reports a duplicate, and NOT called for an unparseable body", async () => {
    const hookCalls: any[] = [];

    const { handler: handler1 } = makeHandler({
      async ingest() {
        return { duplicate: true, reason: "duplicate" };
      },
      onIngested: (info) => {
        hookCalls.push(info);
      },
    });

    await handler1("secret-token-value", validBody);
    await new Promise((r) => setTimeout(r, 0));
    expect(hookCalls.length).toBe(0);

    const { handler: handler2 } = makeHandler({
      onIngested: (info) => {
        hookCalls.push(info);
      },
    });

    await handler2("secret-token-value", { hello: "x" });
    await new Promise((r) => setTimeout(r, 0));
    expect(hookCalls.length).toBe(0);
  });

  it("a hook that throws synchronously, and a hook that returns a rejected promise", async () => {
    const { handler: handler1 } = makeHandler({
      onIngested: () => {
        throw new Error("sync boom");
      },
    });

    const result1 = await handler1("secret-token-value", validBody);
    expect(result1.status).toBe(200);
    expect(result1.json.status).toBe("success");

    const { handler: handler2 } = makeHandler({
      onIngested: async () => {
        throw new Error("async boom");
      },
    });

    const result2 = await handler2("secret-token-value", validBody);
    expect(result2.status).toBe(200);
    expect(result2.json.status).toBe("success");
  });

  it("a hook that waits 50 ms and then sets a flag", async () => {
    let flag = false;
    const { handler } = makeHandler({
      onIngested: async () => {
        await new Promise((r) => setTimeout(r, 50));
        flag = true;
      },
    });

    await handler("secret-token-value", validBody);
    expect(flag).toBe(false);

    await new Promise((r) => setTimeout(r, 100));
    expect(flag).toBe(true);
  });
});
