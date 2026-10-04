/**
 * Unit tests for router logic with mocked providers
 * These test routing logic, not actual API calls
 */

import { z } from "zod";
import { AIRouter } from "../router.js";
import { AIProviderAdapter } from "../providers/provider.interface.js";
import { AIRequest, ProviderName } from "../types.js";
import { AIProviderError, AINoCapableProviderError } from "../errors.js";

// Mock provider for testing
class MockProvider implements AIProviderAdapter {
  public callCount = 0;

  constructor(
    public readonly name: ProviderName,
    public readonly capabilities: { images: boolean; video: boolean } = {
      images: true,
      video: true,
    },
    private shouldFail: boolean = false,
    private mockResponse: unknown = { success: true }
  ) {}

  async call<TSchema extends z.ZodTypeAny>(
    _request: AIRequest<TSchema>
  ): Promise<{
    raw: unknown;
    modelUsed: string;
    usage?: Record<string, number>;
  }> {
    this.callCount++;
    if (this.shouldFail) {
      throw new AIProviderError(`Mock ${this.name} failure`, this.name);
    }

    return {
      raw: this.mockResponse,
      modelUsed: `mock-${this.name}-model`,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}

describe("AIRouter", () => {
  const testSchema = z.object({
    success: z.boolean(),
  });

  const testRequest: AIRequest<typeof testSchema> = {
    systemPrompt: "Test system",
    userPrompt: "Test user",
    responseSchema: testSchema,
    taskName: "test_task",
  };

  beforeEach(() => {
    // Reset singleton state
    AIRouter.getInstance().reset();
  });

  it("should throw if called before initialization", async () => {
    const router = AIRouter.getInstance();
    await expect(router.call(testRequest)).rejects.toThrow("not initialized");
  });

  it("should validate response against schema", async () => {
    const router = AIRouter.getInstance();
    const mockProvider = new MockProvider("gemini");

    // Manually set config for testing
    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
      fallbacks: [],
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.data).toEqual({ success: true });
    expect(response.providerUsed).toBe("gemini");
    expect(response.wasFailover).toBe(false);
  });

  it("should reject invalid schema responses", async () => {
    const router = AIRouter.getInstance();
    const mockProvider = new MockProvider("gemini", { images: true, video: true }, false, { wrong: "schema" });

    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
      fallbacks: [],
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow(
      "failed schema validation"
    );
  });

  it("should failover to secondary provider when primary fails", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("claude", { images: true, video: true }, true);
    const workingFallback = new MockProvider("gemini", { images: true, video: true }, false, { success: true });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingPrimary,
      fallbacks: [workingFallback],
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.data).toEqual({ success: true });
    expect(response.providerUsed).toBe("gemini");
    expect(response.wasFailover).toBe(true);
  });

  it("should throw AIAllProvidersFailed when both fail", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("claude", { images: true, video: true }, true);
    const failingFallback = new MockProvider("gemini", { images: true, video: true }, true);

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingPrimary,
      fallbacks: [failingFallback],
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow(
      "All AI providers failed"
    );
  });

  it("should not attempt fallback in DEMO mode", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("gemini", { images: true, video: true }, true);

    (router as any).config = {
      mode: "DEMO",
      primary: failingPrimary,
      fallbacks: [],
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow("Mock gemini failure");
  });

  it("should try three-provider chain with second fallback serving", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("claude", { images: true, video: true }, true);
    const failingFirstFallback = new MockProvider("gemini", { images: true, video: true }, true);
    const workingSecondFallback = new MockProvider("groq", { images: true, video: true }, false, { success: true });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingPrimary,
      fallbacks: [failingFirstFallback, workingSecondFallback],
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.data).toEqual({ success: true });
    expect(response.providerUsed).toBe("groq");
    expect(response.wasFailover).toBe(true);
    expect(failingPrimary.callCount).toBe(1);
    expect(failingFirstFallback.callCount).toBe(1);
    expect(workingSecondFallback.callCount).toBe(1);
  });

  it("should skip provider without video capability and serve via gemini", async () => {
    const router = AIRouter.getInstance();
    const claudeLikeMock = new MockProvider("claude", { images: true, video: false });
    const geminiLikeMock = new MockProvider("gemini", { images: true, video: true }, false, { success: true });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: claudeLikeMock,
      fallbacks: [geminiLikeMock],
    };
    (router as any).initialized = true;

    const videoRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      video: { mimeType: "video/mp4", base64Data: "test" },
    };

    const response = await router.call(videoRequest);
    expect(response.providerUsed).toBe("gemini");
    expect(response.wasFailover).toBe(true);
    expect(claudeLikeMock.callCount).toBe(0);
    expect(geminiLikeMock.callCount).toBe(1);
  });

  it("should rethrow original error when text-only provider is ineligible", async () => {
    const router = AIRouter.getInstance();
    const failingGemini = new MockProvider("gemini", { images: true, video: true }, true);
    const textOnlyGroq = new MockProvider("groq", { images: false, video: false });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingGemini,
      fallbacks: [textOnlyGroq],
    };
    (router as any).initialized = true;

    const imageRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      images: [{ mimeType: "image/png", base64Data: "test" }],
    };

    await expect(router.call(imageRequest)).rejects.toThrow("Mock gemini failure");
    expect(failingGemini.callCount).toBe(1);
    expect(textOnlyGroq.callCount).toBe(0);
  });

  it("should throw AINoCapableProviderError when no provider supports video", async () => {
    const router = AIRouter.getInstance();
    const textOnlyProvider1 = new MockProvider("claude", { images: true, video: false });
    const textOnlyProvider2 = new MockProvider("groq", { images: false, video: false });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: textOnlyProvider1,
      fallbacks: [textOnlyProvider2],
    };
    (router as any).initialized = true;

    const videoRequest: AIRequest<typeof testSchema> = {
      ...testRequest,
      video: { mimeType: "video/mp4", base64Data: "test" },
    };

    await expect(router.call(videoRequest)).rejects.toThrow(AINoCapableProviderError);
    await expect(router.call(videoRequest)).rejects.toThrow(
      "No provider in the chain supports the required capabilities: video"
    );
  });

  it("should serve via first text-only provider with wasFailover false", async () => {
    const router = AIRouter.getInstance();
    const textOnlyGroq = new MockProvider("groq", { images: false, video: false }, false, { success: true });
    const geminiLikeMock = new MockProvider("gemini", { images: true, video: true });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: textOnlyGroq,
      fallbacks: [geminiLikeMock],
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.providerUsed).toBe("groq");
    expect(response.wasFailover).toBe(false);
    expect(textOnlyGroq.callCount).toBe(1);
    expect(geminiLikeMock.callCount).toBe(0);
  });
});

describe("AIRouter initialization with Groq", () => {
  let savedGeminiKey: string | undefined;
  let savedAnthropicKey: string | undefined;
  let savedForceProvider: string | undefined;
  let savedGroqKey: string | undefined;

  beforeEach(() => {
    savedGeminiKey = process.env.GEMINI_API_KEY;
    savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    savedForceProvider = process.env.AI_FORCE_PROVIDER;
    savedGroqKey = process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    if (savedGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = savedGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }

    if (savedAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }

    if (savedForceProvider !== undefined) {
      process.env.AI_FORCE_PROVIDER = savedForceProvider;
    } else {
      delete process.env.AI_FORCE_PROVIDER;
    }

    if (savedGroqKey !== undefined) {
      process.env.GROQ_API_KEY = savedGroqKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  });

  it("should add Groq fallback when GROQ_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_FORCE_PROVIDER;
    process.env.GROQ_API_KEY = "test-groq";

    const router = AIRouter.getInstance();
    router.reset();
    await router.initialize();

    const config = router.getConfig();
    expect(config?.primary.name).toBe("gemini");
    expect(config?.fallbacks.map((f) => f.name)).toEqual(["groq"]);
  });

  it("should not add Groq fallback when GROQ_API_KEY is unset", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_FORCE_PROVIDER;
    delete process.env.GROQ_API_KEY;

    const router = AIRouter.getInstance();
    router.reset();
    await router.initialize();

    const config = router.getConfig();
    expect(config?.primary.name).toBe("gemini");
    expect(config?.fallbacks).toEqual([]);
  });

  it("should not add Groq when AI_FORCE_PROVIDER is gemini", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_FORCE_PROVIDER = "gemini";
    process.env.GROQ_API_KEY = "test-groq";

    const router = AIRouter.getInstance();
    router.reset();
    await router.initialize();

    const config = router.getConfig();
    expect(config?.primary.name).toBe("gemini");
    expect(config?.fallbacks).toEqual([]);
  });
});

