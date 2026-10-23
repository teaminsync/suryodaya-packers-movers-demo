import { z } from "zod";
import { AIRequest, AIResponse, ProviderName } from "./types.js";
import { AIProviderAdapter } from "./providers/provider.interface.js";
import { ClaudeAdapter } from "./providers/claude.js";
import { GeminiAdapter } from "./providers/gemini.js";
import { GroqAdapter, DEFAULT_GROQ_VISION_MODEL } from "./providers/groq.js";
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
  mediaChain?: AIProviderAdapter[];
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
    if (forceProvider) {
      console.warn(
        `[AI Router] AI_FORCE_PROVIDER is no longer supported and is ignored (was: "${forceProvider}")`
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

    // Reuse one Gemini instance
    const geminiAdapter = new GeminiAdapter();

    // Check if we should try production mode
    if (anthropicKey) {
      try {
        const claudeAdapter = new ClaudeAdapter();
        const isValid = await claudeAdapter.validateKey();

        if (isValid) {
          // Production mode: Claude primary, Gemini fallback for text; Gemini for media
          this.config = {
            mode: "PRODUCTION",
            primary: claudeAdapter,
            fallbacks: [geminiAdapter],
            mediaChain: [geminiAdapter],
          };
          console.info(
            "AI profile: PRODUCTION | text: claude -> gemini | media: gemini"
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

    // Demo mode: Groq primary (if available), otherwise Gemini; media chain determined by MEDIA_IMAGE_PRIMARY
    if (process.env.GROQ_API_KEY) {
      const groqVision = new GroqAdapter({
        model: process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL,
        images: true,
        reasoning: { effort: "none", format: "hidden" },
        maxRetryAfterMs: 30000,
      });

      const mediaImagePrimary = (process.env.MEDIA_IMAGE_PRIMARY || "").trim().toLowerCase();
      let mediaChain: AIProviderAdapter[];
      if (mediaImagePrimary === "groq") {
        mediaChain = [groqVision, geminiAdapter];
      } else if (mediaImagePrimary === "gemini" || mediaImagePrimary === "") {
        mediaChain = [geminiAdapter, groqVision];
      } else {
        console.warn(
          `[AI Router] MEDIA_IMAGE_PRIMARY must be "groq" or "gemini" (got "${process.env.MEDIA_IMAGE_PRIMARY}"), using "gemini"`
        );
        mediaChain = [geminiAdapter, groqVision];
      }

      const mediaNames = mediaChain.map((p) => p.name).join(" -> ");

      this.config = {
        mode: "DEMO",
        primary: new GroqAdapter(),
        fallbacks: [geminiAdapter],
        mediaChain,
      };
      console.info(
        `AI profile: DEMO | text: groq -> gemini | images: ${mediaNames} | video: gemini`
      );
    } else {
      this.config = {
        mode: "DEMO",
        primary: geminiAdapter,
        fallbacks: [],
        mediaChain: [geminiAdapter],
      };
      console.info(
        "AI profile: DEMO | text: gemini | images: gemini | video: gemini"
      );
    }

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
    const { mode, primary, fallbacks, mediaChain } = this.config;

    // Check if this is a media request
    const hasMedia = (request.images?.length ?? 0) > 0 || !!request.video;

    // Build provider chain
    const chain = hasMedia && mediaChain ? mediaChain : [primary, ...fallbacks];

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

    // Determine baseline for failover calculation
    const baseline = hasMedia && mediaChain ? eligible[0] : primary;

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
        const wasFailover = provider !== baseline;

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

        const label = provider === baseline ? "Primary provider" : "Fallback provider";
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
      wasFailover: failures[failures.length - 1].provider !== baseline.name,
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
