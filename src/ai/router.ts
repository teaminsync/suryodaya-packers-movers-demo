import { z } from "zod";
import { AIRequest, AIResponse } from "./types.js";
import { AIProviderAdapter } from "./providers/provider.interface.js";
import { ClaudeAdapter } from "./providers/claude.js";
import { GeminiAdapter } from "./providers/gemini.js";
import {
  AISchemaValidationError,
  AIAllProvidersFailed,
} from "./errors.js";

type AIMode = "PRODUCTION" | "DEMO";

interface RouterConfig {
  mode: AIMode;
  primary: AIProviderAdapter;
  fallback?: AIProviderAdapter;
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

    const forceProvider = process.env.AI_FORCE_PROVIDER as
      | "claude"
      | "gemini"
      | undefined;

    // Manual override path
    if (forceProvider) {
      console.warn(
        `[AI Router] AI_FORCE_PROVIDER is set to "${forceProvider}" - bypassing auto-detection`
      );
      await this.initializeWithForcedProvider(forceProvider);
      this.initialized = true;
      return;
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
            fallback: new GeminiAdapter(),
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
    };
    console.info(
      "🎮 AI mode: DEMO (no valid Anthropic key found, Gemini primary, no fallback configured)"
    );
    this.initialized = true;
  }

  private async initializeWithForcedProvider(
    provider: "claude" | "gemini"
  ): Promise<void> {
    if (provider === "claude") {
      this.config = {
        mode: "PRODUCTION",
        primary: new ClaudeAdapter(),
        fallback: new GeminiAdapter(),
      };
      console.info("🔧 AI mode: FORCED PRODUCTION (Claude primary / Gemini fallback)");
    } else {
      this.config = {
        mode: "DEMO",
        primary: new GeminiAdapter(),
      };
      console.info("🔧 AI mode: FORCED DEMO (Gemini primary, no fallback)");
    }
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
    const { mode, primary, fallback } = this.config;

    // Try primary provider
    try {
      const result = await this.executeProvider(primary, request);
      const latencyMs = Date.now() - startTime;

      this.logCallResult({
        taskName: request.taskName,
        mode,
        providerUsed: primary.name,
        wasFailover: false,
        latencyMs,
        success: true,
      });

      return {
        data: result.validated,
        providerUsed: primary.name,
        modelUsed: result.modelUsed,
        wasFailover: false,
        latencyMs,
        rawUsage: result.usage,
      };
    } catch (primaryError) {
      const primaryErrorMessage =
        primaryError instanceof Error ? primaryError.message : String(primaryError);

      console.warn(
        `[AI Router] Primary provider (${primary.name}) failed for task "${request.taskName}":`,
        primaryErrorMessage
      );

      // In demo mode, no fallback available
      if (!fallback) {
        const latencyMs = Date.now() - startTime;
        this.logCallResult({
          taskName: request.taskName,
          mode,
          providerUsed: primary.name,
          wasFailover: false,
          latencyMs,
          success: false,
          errorReason: primaryErrorMessage,
        });
        throw primaryError;
      }

      // Production mode: try fallback
      console.info(
        `[AI Router] Attempting fallback to ${fallback.name} for task "${request.taskName}"`
      );

      try {
        const result = await this.executeProvider(fallback, request);
        const latencyMs = Date.now() - startTime;

        this.logCallResult({
          taskName: request.taskName,
          mode,
          providerUsed: fallback.name,
          wasFailover: true,
          latencyMs,
          success: true,
        });

        return {
          data: result.validated,
          providerUsed: fallback.name,
          modelUsed: result.modelUsed,
          wasFailover: true,
          latencyMs,
          rawUsage: result.usage,
        };
      } catch (fallbackError) {
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);

        const latencyMs = Date.now() - startTime;
        this.logCallResult({
          taskName: request.taskName,
          mode,
          providerUsed: fallback.name,
          wasFailover: true,
          latencyMs,
          success: false,
          errorReason: fallbackErrorMessage,
        });

        // Both failed
        throw new AIAllProvidersFailed([
          {
            provider: primary.name,
            error:
              primaryError instanceof Error
                ? primaryError
                : new Error(String(primaryError)),
          },
          {
            provider: fallback.name,
            error:
              fallbackError instanceof Error
                ? fallbackError
                : new Error(String(fallbackError)),
          },
        ]);
      }
    }
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
    providerUsed: "claude" | "gemini";
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
