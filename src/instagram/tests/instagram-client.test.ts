/**
 * Tests for Instagram client
 */

import { createInstagramClient } from "../client.js";

interface FetchCall {
  url: string;
  options: RequestInit;
}

describe("Instagram client", () => {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  let fetchResponse: { ok: boolean; status: number; json: () => Promise<any> } = {
    ok: true,
    status: 200,
    json: async () => ({ message_id: "m1" }),
  };

  beforeEach(() => {
    calls.length = 0;
    fetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({ message_id: "m1" }),
    };

    globalThis.fetch = async (url: any, options: any) => {
      calls.push({ url, options });
      return fetchResponse as any;
    };
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("dry run mode does not call fetch", async () => {
    const client = createInstagramClient({
      accessToken: "TOKEN1",
      accountId: "ACC1",
      apiVersion: "v25.0",
      dryRun: true,
    });

    const result = await client.sendText("IG1", "hello");

    expect(calls.length).toBe(0);
    expect(result.mid).toMatch(/^dry-/);

    const profile = await client.getProfile("IG1");
    expect(profile).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("real mode calls fetch with correct params", async () => {
    const client = createInstagramClient({
      accessToken: "TOKEN1",
      accountId: "ACC1",
      apiVersion: "v25.0",
      dryRun: false,
    });

    const result = await client.sendText("IG1", "hello");

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://graph.instagram.com/v25.0/ACC1/messages");
    expect(calls[0].options.method).toBe("POST");
    expect(calls[0].options.headers).toEqual({
      Authorization: "Bearer TOKEN1",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      recipient: { id: "IG1" },
      message: { text: "hello" },
    });
    expect(result.mid).toBe("m1");
  });

  it("non-OK response throws error with status", async () => {
    fetchResponse = {
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 100 } }),
    };

    const client = createInstagramClient({
      accessToken: "TOKEN1",
      accountId: "ACC1",
      apiVersion: "v25.0",
      dryRun: false,
    });

    await expect(client.sendText("IG1", "hello")).rejects.toThrow("400");

    fetchResponse = {
      ok: false,
      status: 500,
      json: async () => ({}),
    };

    const profile = await client.getProfile("IG1");
    expect(profile).toBeNull();
  });
});
