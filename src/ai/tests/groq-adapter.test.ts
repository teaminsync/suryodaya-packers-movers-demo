/**
 * Unit tests for GroqAdapter
 */

import { z } from "zod";
import { GroqAdapter } from "../providers/groq.js";
import { AIProviderError } from "../errors.js";
import { AIRequest } from "../types.js";

describe("GroqAdapter", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    fetchCalls = [];
    originalFetch = globalThis.fetch;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({
        url: url.toString(),
        init: init || {},
      });

      // Return mock response based on test setup
      if (typeof url === "string" && url.includes("groq.com")) {
        // Default success response
        return new Response(
          JSON.stringify({
            id: "x",
            model: "openai/gpt-oss-120b",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: '{"ok":true}',
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 3,
            },
          }),
          {
            status: 200,
            statusText: "OK",
            headers: new Headers({
              "x-ratelimit-limit-requests": "100",
              "x-ratelimit-limit-tokens": "10000",
              "x-ratelimit-remaining-requests": "99",
              "x-ratelimit-remaining-tokens": "9995",
              "x-ratelimit-reset-requests": "60",
              "x-ratelimit-reset-tokens": "60",
            }),
          }
        );
      }

      return new Response("Not found", { status: 404 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  });

  const testSchema = z.object({ ok: z.boolean() });
  const testRequest: AIRequest<typeof testSchema> = {
    systemPrompt: "test",
    userPrompt: "test",
    responseSchema: testSchema,
    taskName: "groq_test",
  };

  it("should successfully call Groq API and return parsed response", async () => {
    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    const response = await adapter.call(testRequest);

    expect(response.raw).toEqual({ ok: true });
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");

    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.response_format.type).toBe("json_object");
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("test");
    expect(body.messages[0].content).toContain("JSON Schema");
  });

  it("should retry on 503 and succeed on second attempt", async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      fetchCalls.push({ url: "test", init: {} });

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Service unavailable" }), {
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "99",
          }),
        });
      }

      return new Response(
        JSON.stringify({
          id: "x",
          model: "openai/gpt-oss-120b",
          choices: [
            {
              message: {
                role: "assistant",
                content: '{"ok":true}',
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
          },
        }),
        {
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "98",
          }),
        }
      );
    };

    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    const response = await adapter.call(testRequest);

    expect(response.raw).toEqual({ ok: true });
    expect(fetchCalls.length).toBe(2);
  });

  it("should retry on 429 with retry-after 0 and succeed", async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      fetchCalls.push({ url: "test", init: {} });

      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "Rate limit" }), {
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers({
            "retry-after": "0",
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "0",
          }),
        });
      }

      return new Response(
        JSON.stringify({
          id: "x",
          model: "openai/gpt-oss-120b",
          choices: [
            {
              message: {
                role: "assistant",
                content: '{"ok":true}',
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
          },
        }),
        {
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "99",
          }),
        }
      );
    };

    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    const response = await adapter.call(testRequest);

    expect(response.raw).toEqual({ ok: true });
    expect(fetchCalls.length).toBe(2);
  });

  it("should not retry on 429 with high retry-after", async () => {
    globalThis.fetch = async () => {
      fetchCalls.push({ url: "test", init: {} });

      return new Response(JSON.stringify({ error: "Rate limit" }), {
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({
          "retry-after": "60",
          "x-ratelimit-limit-requests": "100",
          "x-ratelimit-remaining-requests": "0",
        }),
      });
    };

    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    
    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(testRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.statusCode).toBe(429);
    expect(fetchCalls.length).toBe(1);
  });

  it("should not retry on 400 error", async () => {
    globalThis.fetch = async () => {
      fetchCalls.push({ url: "test", init: {} });

      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        statusText: "Bad Request",
        headers: new Headers({
          "x-ratelimit-limit-requests": "100",
          "x-ratelimit-remaining-requests": "99",
        }),
      });
    };

    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    
    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(testRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(fetchCalls.length).toBe(1);
  });

  it("should reject image requests without calling fetch", async () => {
    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    const imageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/png", base64Data: "test" }],
    };

    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(imageRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(fetchCalls.length).toBe(0);
  });

  it("should reject response with empty content", async () => {
    globalThis.fetch = async () => {
      fetchCalls.push({ url: "test", init: {} });

      return new Response(
        JSON.stringify({
          id: "x",
          model: "openai/gpt-oss-120b",
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
              },
              finish_reason: "length",
            },
          ],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
          },
        }),
        {
          status: 200,
          statusText: "OK",
          headers: new Headers({
            "x-ratelimit-limit-requests": "100",
            "x-ratelimit-remaining-requests": "99",
          }),
        }
      );
    };

    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    
    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(testRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("length");
  });

  it("should throw when GROQ_API_KEY is not set", () => {
    delete process.env.GROQ_API_KEY;

    expect(() => {
      new GroqAdapter();
    }).toThrow("GROQ_API_KEY is required for Groq adapter");
  });
});
