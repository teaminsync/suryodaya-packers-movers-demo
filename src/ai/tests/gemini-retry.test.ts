import { z } from "zod";
import { GeminiAdapter } from "../providers/gemini.js";
import { AIProviderError } from "../errors.js";

describe("GeminiAdapter retry logic", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCallCount: number;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCallCount = 0;
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  const successBody = {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: '{"ok":true}' }],
        },
        finishReason: "STOP",
      },
    ],
  };

  test("503, 503, then 200 -> call resolves, fetch called exactly 3 times", async () => {
    const adapter = new GeminiAdapter({ retryDelaysMs: [1, 1] });
    const schema = z.object({ ok: z.boolean() });

    globalThis.fetch = async () => {
      fetchCallCount++;
      if (fetchCallCount <= 2) {
        return new Response(JSON.stringify({ error: "Service unavailable" }), {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
      return new Response(JSON.stringify(successBody), {
        status: 200,
        statusText: "OK",
      });
    };

    const result = await adapter.call({
      systemPrompt: "test",
      userPrompt: "test",
      responseSchema: schema,
      taskName: "retry_test",
    });

    expect(fetchCallCount).toBe(3);
    expect(result.raw).toEqual({ ok: true });
  });

  test("503 on all 3 attempts -> rejects with AIProviderError whose statusCode is 503, fetch called exactly 3 times", async () => {
    const adapter = new GeminiAdapter({ retryDelaysMs: [1, 1] });
    const schema = z.object({ ok: z.boolean() });

    globalThis.fetch = async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ error: "Service unavailable" }), {
        status: 503,
        statusText: "Service Unavailable",
      });
    };

    let caught: unknown;
    try {
      await adapter.call({
        systemPrompt: "test",
        userPrompt: "test",
        responseSchema: schema,
        taskName: "retry_test",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AIProviderError);
    expect((caught as AIProviderError).statusCode).toBe(503);
    expect(fetchCallCount).toBe(3);
  });

  test("400 -> rejects, fetch called exactly 1 time (no retry)", async () => {
    const adapter = new GeminiAdapter({ retryDelaysMs: [1, 1] });
    const schema = z.object({ ok: z.boolean() });

    globalThis.fetch = async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        statusText: "Bad Request",
      });
    };

    await expect(
      adapter.call({
        systemPrompt: "test",
        userPrompt: "test",
        responseSchema: schema,
        taskName: "retry_test",
      })
    ).rejects.toThrow(AIProviderError);

    expect(fetchCallCount).toBe(1);
  });

  test("200 immediately -> fetch called exactly 1 time", async () => {
    const adapter = new GeminiAdapter({ retryDelaysMs: [1, 1] });
    const schema = z.object({ ok: z.boolean() });

    globalThis.fetch = async () => {
      fetchCallCount++;
      return new Response(JSON.stringify(successBody), {
        status: 200,
        statusText: "OK",
      });
    };

    const result = await adapter.call({
      systemPrompt: "test",
      userPrompt: "test",
      responseSchema: schema,
      taskName: "retry_test",
    });

    expect(fetchCallCount).toBe(1);
    expect(result.raw).toEqual({ ok: true });
  });
});
