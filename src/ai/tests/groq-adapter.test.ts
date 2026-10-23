/**
 * Unit tests for GroqAdapter
 */

import { z } from "zod";
import { GroqAdapter, DEFAULT_GROQ_VISION_MODEL } from "../providers/groq.js";
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

  it("DEFAULT_GROQ_VISION_MODEL should equal qwen/qwen3.8-27b", () => {
    expect(DEFAULT_GROQ_VISION_MODEL).toBe("qwen/qwen3.8-27b");
  });

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

  it("should have capabilities.images false by default", () => {
    const adapter = new GroqAdapter({ retryDelaysMs: [1, 1] });
    expect(adapter.capabilities.images).toBe(false);
    expect(adapter.capabilities.video).toBe(false);
  });

  it("should have capabilities.images true when constructed with images option", async () => {
    const adapter = new GroqAdapter({
      images: true,
      model: "qwen/qwen3.8-27b",
      retryDelaysMs: [1, 1],
    });
    expect(adapter.capabilities.images).toBe(true);
    expect(adapter.capabilities.video).toBe(false);

    const response = await adapter.call(testRequest);
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.model).toBe("qwen/qwen3.8-27b");
  });

  it("should send image as array content part when images enabled", async () => {
    const adapter = new GroqAdapter({
      images: true,
      model: "qwen/qwen3.8-27b",
      retryDelaysMs: [1, 1],
    });

    const imageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/jpeg", base64Data: "AAAA" }],
    };

    await adapter.call(imageRequest);
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0].init.body as string);
    const userMessage = body.messages[1];
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content[0]).toEqual({ type: "text", text: "test" });
    expect(userMessage.content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
  });

  it("should keep content as plain string for text-only request on images adapter", async () => {
    const adapter = new GroqAdapter({
      images: true,
      model: "qwen/qwen3.8-27b",
      retryDelaysMs: [1, 1],
    });

    await adapter.call(testRequest);
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0].init.body as string);
    const userMessage = body.messages[1];
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toBe("test");
  });

  it("should reject video on images adapter without calling fetch", async () => {
    const adapter = new GroqAdapter({
      images: true,
      model: "qwen/qwen3.8-27b",
      retryDelaysMs: [1, 1],
    });

    const videoRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      video: { mimeType: "video/mp4", base64Data: "test" },
    };

    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(videoRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("does not support image or video");
    expect(fetchCalls.length).toBe(0);
  });

  it("should reject more than 5 images without calling fetch", async () => {
    const adapter = new GroqAdapter({
      images: true,
      retryDelaysMs: [1, 1],
    });

    const manyImagesRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: Array.from({ length: 6 }, () => ({
        mimeType: "image/jpeg" as const,
        base64Data: "A",
      })),
    };

    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(manyImagesRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("at most 5 images");
    expect(fetchCalls.length).toBe(0);
  });

  it("should reject image larger than 3.5M characters without calling fetch", async () => {
    const adapter = new GroqAdapter({
      images: true,
      retryDelaysMs: [1, 1],
    });

    const largeImageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/jpeg", base64Data: "A".repeat(3600000) }],
    };

    let caughtError: AIProviderError | undefined;
    try {
      await adapter.call(largeImageRequest);
    } catch (error) {
      if (error instanceof AIProviderError) {
        caughtError = error;
      }
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toContain("too large for Groq vision");
    expect(fetchCalls.length).toBe(0);
  });

  it("should successfully call Groq vision API and return parsed response", async () => {
    const adapter = new GroqAdapter({
      images: true,
      retryDelaysMs: [1, 1],
    });

    const imageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/png", base64Data: "test" }],
    };

    const response = await adapter.call(imageRequest);
    expect(response.raw).toEqual({ ok: true });
    expect(fetchCalls.length).toBe(1);
  });

  it("should send reasoning parameters when configured", async () => {
    const adapter = new GroqAdapter({
      images: true,
      reasoning: { effort: "none", format: "hidden" },
      retryDelaysMs: [1, 1],
    });

    const imageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/png", base64Data: "test" }],
    };

    await adapter.call(imageRequest);
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(body.reasoning_effort).toBe("none");
    expect(body.reasoning_format).toBe("hidden");
  });

  it("should not send reasoning parameters when not configured", async () => {
    const adapter = new GroqAdapter({
      retryDelaysMs: [1, 1],
    });

    await adapter.call(testRequest);
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(Object.prototype.hasOwnProperty.call(body, "reasoning_effort")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, "reasoning_format")).toBe(false);
  });
});
