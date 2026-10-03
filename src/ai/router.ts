import { z } from "zod";
import { AIRequest, AIResponse, ProviderName } from "./types.js";
import { AIProviderAdapter } from "./providers/provider.interface.js";
import { ClaudeAdapter } from "./providers/claude.js";
import { GeminiAdapter } from "./providers/gemini.js";
import {
  AISchemaValidationError,
  AIAllProvidersFailed,
  AINoCapableProviderError,
} from "./errors.js";

type AIMode = "PRODUCTION" | "DEMO";

interface RouterConfig {
  mode: AIMode;
  primary: AIProviderAdapter;
  fallbacks: AIProviderAdapter[];
}

/**
 * Central AI router - the only thing application code imports
 */
export class AIRouter {
  private static instance: AIRouter | null = null;
  private config: RouterConfig | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  /**
   * Initialize the router - must be called once at startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn("[AI Router] Already initialized, skipping");
      return;
    }

    const forceProvider = process.env.AI_FORCE_PROVIDER;

    // Manual override path (Gemini only - for cost control during dev)
    if (forceProvider === "gemini") {
      console.warn(
        `[AI Router] AI_FORCE_PROVIDER=gemini - forcing Gemini even if Anthropic key present`
      );
      this.config = {
        mode: "DEMO",
        primary: new GeminiAdapter(),
        fallbacks: [],
      };
      console.info("🔧 AI mode: FORCED DEMO (Gemini primary, no fallback)");
      this.initialized = true;
      return;
    }

    if (forceProvider && forceProvider !== "gemini") {
      throw new Error(
        `AI_FORCE_PROVIDER must be "gemini" or unset. Got: "${forceProvider}"`
      );
    }

    // Auto-detection path
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Gemini is required in all modes
    if (!geminiKey) {
      throw new Error(
        "GEMINI_API_KEY is required in both PRODUCTION and DEMO modes"
      );
    }

    // Check if we should try production mode
    if (anthropicKey) {
      try {
        const claudeAdapter = new ClaudeAdapter();
        const isValid = await claudeAdapter.validateKey();

        if (isValid) {
          // Production mode: Claude primary, Gemini fallback
          this.config = {
            mode: "PRODUCTION",
            primary: claudeAdapter,
            fallbacks: [new GeminiAdapter()],
          };
          console.info(
            "🚀 AI mode: PRODUCTION (Anthropic key validated, Claude primary / Gemini fallback)"
          );
          this.initialized = true;
          return;
        } else {
          console.warn(
            "[AI Router] ANTHROPIC_API_KEY present but failed validation - falling back to DEMO mode"
          );
        }
      } catch (error) {
        console.warn(
          "[AI Router] Failed to initialize Claude adapter - falling back to DEMO mode:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Demo mode: Gemini primary, no fallback
    this.config = {
      mode: "DEMO",
      primary: new GeminiAdapter(),
      fallbacks: [],
    };
    console.info(
      "🎮 AI mode: DEMO (no valid Anthropic key found, Gemini primary, no fallback configured)"
    );
    this.initialized = true;
  }

  /**
   * Execute an AI request with automatic provider selection and failover
   */
  async call<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>
  ): Promise<AIResponse<z.infer<TSchema>>> {
    if (!this.initialized || !this.config) {
      throw new Error(
        "AIRouter not initialized - call initialize() before making requests"
      );
    }

    const startTime = Date.now();
    const { mode, primary, fallbacks } = this.config;

    // Build provider chain
    const chain = [primary, ...fallbacks];

    // Determine required capabilities
    const required = {
      images: (request.images?.length ?? 0) > 0,
      video: !!request.video,
    };

    // Filter to eligible providers
    const eligible = chain.filter((provider) => {
      if (required.images && !provider.capabilities.images) return false;
      if (required.video && !provider.capabilities.video) return false;
      return true;
    });

    // Log skipped providers
    for (const provider of chain) {
      if (!eligible.includes(provider)) {
        const lacking: string[] = [];
        if (required.images && !provider.capabilities.images) lacking.push("images");
        if (required.video && !provider.capabilities.video) lacking.push("video");
        console.info(
          `[AI Router] Skipping ${provider.name} for task "${request.taskName}": lacks ${lacking.join(", ")} support`
        );
      }
    }

    // Check if any provider is eligible
    if (eligible.length === 0) {
      const needs: string[] = [];
      if (required.images) needs.push("images");
      if (required.video) needs.push("video");
      throw new AINoCapableProviderError(needs);
    }

    // Try each eligible provider in order
    const failures: Array<{ provider: ProviderName; error: Error }> = [];

    for (let i = 0; i < eligible.length; i++) {
      const provider = eligible[i];
      const isFirst = i === 0;

      if (!isFirst) {
        console.info(
          `[AI Router] Attempting fallback to ${provider.name} for task "${request.taskName}"`
        );
      }

      try {
        const result = await this.executeProvider(provider, request);
        const latencyMs = Date.now() - startTime;
        const wasFailover = provider !== primary;

        this.logCallResult({
          taskName: request.taskName,
          mode,
          providerUsed: provider.name,
          wasFailover,
          latencyMs,
          success: true,
        });

        return {
          data: result.validated,
          providerUsed: provider.name,
          modelUsed: result.modelUsed,
          wasFailover,
          latencyMs,
          rawUsage: result.usage,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        const label = provider === primary ? "Primary provider" : "Fallback provider";
        console.warn(`[AI Router] ${label} (${provider.name}) failed for task "${request.taskName}":`, errorMessage);

        failures.push({
          provider: provider.name,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // All eligible providers failed
    const latencyMs = Date.now() - startTime;

    this.logCallResult({
      taskName: request.taskName,
      mode,
      providerUsed: failures[failures.length - 1].provider,
      wasFailover: failures[failures.length - 1].provider !== primary.name,
      latencyMs,
      success: false,
      errorReason: failures[failures.length - 1].error.message,
    });

    // If only one provider was attempted, rethrow its error
    if (failures.length === 1) {
      throw failures[0].error;
    }

    // Multiple providers failed
    throw new AIAllProvidersFailed(failures);
  }

  private async executeProvider<TSchema extends z.ZodTypeAny>(
    provider: AIProviderAdapter,
    request: AIRequest<TSchema>
  ): Promise<{
    validated: z.infer<TSchema>;
    modelUsed: string;
    usage?: Record<string, number>;
  }> {
    // Call provider
    const response = await provider.call(request);

    // Validate response against schema
    try {
      const validated = request.responseSchema.parse(response.raw);
      return {
        validated,
        modelUsed: response.modelUsed,
        usage: response.usage,
      };
    } catch (validationError) {
      // Log the actual response for debugging
      console.error(
        `[AI Router] Schema validation failed for ${provider.name}:`,
        JSON.stringify(response.raw, null, 2)
      );
      throw new AISchemaValidationError(
        `Response from ${provider.name} failed schema validation`,
        provider.name,
        validationError,
        response.raw
      );
    }
  }

  private logCallResult(log: {
    taskName: string;
    mode: AIMode;
    providerUsed: ProviderName;
    wasFailover: boolean;
    latencyMs: number;
    success: boolean;
    errorReason?: string;
  }): void {
    const logLine = {
      timestamp: new Date().toISOString(),
      ...log,
    };
    console.info("[AI Router] Call result:", JSON.stringify(logLine));
  }

  /**
   * Get current router configuration (for testing/debugging)
   */
  getConfig(): RouterConfig | null {
    return this.config;
  }

  /**
   * Reset the router (for testing only)
   */
  reset(): void {
    this.initialized = false;
    this.config = null;
  }
}

// Export singleton instance access
export const aiRouter = AIRouter.getInstance();
