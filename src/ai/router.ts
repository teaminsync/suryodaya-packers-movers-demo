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
import {
  defaultTextChain,
  defaultImageChain,
  resolveChain,
  type ChainProvider,
} from "./chain-config.js";

type AIMode = "PRODUCTION" | "DEMO";

interface RouterConfig {
  mode: AIMode;
  primary: AIProviderAdapter;
  fallbacks: AIProviderAdapter[];
  mediaChain?: AIProviderAdapter[];
  videoChain?: AIProviderAdapter[];
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

    // Gather API keys
    const keys = {
      claude: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
    };

    // Resolve text and image chains
    const text = resolveChain(process.env.AI_TEXT_CHAIN, keys, defaultTextChain(keys));
    const image = resolveChain(process.env.AI_IMAGE_CHAIN, keys, defaultImageChain(keys));

    // Log warnings for unknown names and missing keys
    for (const name of text.unknown) {
      console.warn(`[AI Router] Unknown provider "${name}" in AI_TEXT_CHAIN ignored`);
    }
    for (const name of text.skippedNoKey) {
      console.warn(`[AI Router] ${name} listed in AI_TEXT_CHAIN but its API key is not set; skipped`);
    }
    for (const name of image.unknown) {
      console.warn(`[AI Router] Unknown provider "${name}" in AI_IMAGE_CHAIN ignored`);
    }
    for (const name of image.skippedNoKey) {
      console.warn(`[AI Router] ${name} listed in AI_IMAGE_CHAIN but its API key is not set; skipped`);
    }

    // Build adapters lazily, once each
    const adapters: Record<string, AIProviderAdapter | null> = {
      gemini: keys.gemini ? new GeminiAdapter() : null,
      groqText: keys.groq ? new GroqAdapter() : null,
      groqVision: keys.groq
        ? new GroqAdapter({
            model: process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL,
            images: true,
            reasoning: { effort: "none", format: "hidden" },
            maxRetryAfterMs: 30000,
          })
        : null,
      claude: null,
    };

    // Build Claude only if it appears in a chain after key filtering
    const claudeStillInChain =
      text.names.includes("claude") || image.names.includes("claude");
    if (claudeStillInChain && keys.claude) {
      try {
        const claudeAdapter = new ClaudeAdapter();
        const isValid = await claudeAdapter.validateKey();
        if (!isValid) {
          console.warn("[AI Router] claude listed but its key failed validation; skipped");
          // Remove claude from both chains
          text.names = text.names.filter((n) => n !== "claude") as ChainProvider[];
          image.names = image.names.filter((n) => n !== "claude") as ChainProvider[];
        } else {
          adapters.claude = claudeAdapter;
        }
      } catch (error) {
        console.warn(
          "[AI Router] claude listed but its key failed validation; skipped:",
          error instanceof Error ? error.message : String(error)
        );
        text.names = text.names.filter((n) => n !== "claude") as ChainProvider[];
        image.names = image.names.filter((n) => n !== "claude") as ChainProvider[];
      }
    }

    // Map names to adapters
    const textAdapters: AIProviderAdapter[] = [];
    for (const name of text.names) {
      const adapter =
        name === "groq" ? adapters.groqText : name === "claude" ? adapters.claude : adapters.gemini;
      if (adapter) textAdapters.push(adapter);
    }

    const imageAdapters: AIProviderAdapter[] = [];
    for (const name of image.names) {
      const adapter =
        name === "groq" ? adapters.groqVision : name === "claude" ? adapters.claude : adapters.gemini;
      if (adapter) imageAdapters.push(adapter);
    }

    // Check if text chain is empty
    if (textAdapters.length === 0) {
      let msg = "No usable text provider. Set GEMINI_API_KEY and/or GROQ_API_KEY";
      if (text.provided) {
        msg += ` or fix AI_TEXT_CHAIN (got "${process.env.AI_TEXT_CHAIN}")`;
      }
      throw new Error(msg);
    }

    // Determine mode
    const mode: AIMode = textAdapters[0].name === "claude" ? "PRODUCTION" : "DEMO";

    // Build config
    const videoChain = adapters.gemini ? [adapters.gemini] : [];
    this.config = {
      mode,
      primary: textAdapters[0],
      fallbacks: textAdapters.slice(1),
      mediaChain: imageAdapters,
      videoChain,
    };

    // Log summary
    const textNames = textAdapters.map((a) => a.name).join(" -> ");
    const imageNames = imageAdapters.length > 0 ? imageAdapters.map((a) => a.name).join(" -> ") : "none";
    const videoName = adapters.gemini ? "gemini" : "none";
    console.info(`AI profile (${mode}): text: ${textNames} | images: ${imageNames} | video: ${videoName}`);

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
    const { mode, primary, fallbacks, mediaChain, videoChain } = this.config;

    // Check if this is a media request
    const hasMedia = (request.images?.length ?? 0) > 0 || !!request.video;

    // Build provider chain
    let chain: AIProviderAdapter[];
    if (request.video && videoChain !== undefined) {
      chain = videoChain;
    } else if (hasMedia && mediaChain !== undefined) {
      chain = mediaChain;
    } else {
      chain = [primary, ...fallbacks];
    }

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
    const baseline =
      (request.video && videoChain !== undefined) || (hasMedia && mediaChain !== undefined)
        ? eligible[0]
        : primary;

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
