/**
 * Unit tests for router logic with mocked providers
 * These test routing logic, not actual API calls
 */

import { z } from "zod";
import { AIRouter } from "../router.js";
import { AIProviderAdapter } from "../providers/provider.interface.js";
import { AIRequest } from "../types.js";
import { AIProviderError } from "../errors.js";

// Mock provider for testing
class MockProvider implements AIProviderAdapter {
  constructor(
    public readonly name: "claude" | "gemini",
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
    const mockProvider = new MockProvider("gemini", false, { success: true });

    // Manually set config for testing
    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.data).toEqual({ success: true });
    expect(response.providerUsed).toBe("gemini");
    expect(response.wasFailover).toBe(false);
  });

  it("should reject invalid schema responses", async () => {
    const router = AIRouter.getInstance();
    const mockProvider = new MockProvider("gemini", false, { wrong: "schema" });

    (router as any).config = {
      mode: "DEMO",
      primary: mockProvider,
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow(
      "failed schema validation"
    );
  });

  it("should failover to secondary provider when primary fails", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("claude", true);
    const workingFallback = new MockProvider("gemini", false, { success: true });

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingPrimary,
      fallback: workingFallback,
    };
    (router as any).initialized = true;

    const response = await router.call(testRequest);
    expect(response.data).toEqual({ success: true });
    expect(response.providerUsed).toBe("gemini");
    expect(response.wasFailover).toBe(true);
  });

  it("should throw AIAllProvidersFailed when both fail", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("claude", true);
    const failingFallback = new MockProvider("gemini", true);

    (router as any).config = {
      mode: "PRODUCTION",
      primary: failingPrimary,
      fallback: failingFallback,
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow(
      "All AI providers failed"
    );
  });

  it("should not attempt fallback in DEMO mode", async () => {
    const router = AIRouter.getInstance();
    const failingPrimary = new MockProvider("gemini", true);

    (router as any).config = {
      mode: "DEMO",
      primary: failingPrimary,
    };
    (router as any).initialized = true;

    await expect(router.call(testRequest)).rejects.toThrow("Mock gemini failure");
  });
});
