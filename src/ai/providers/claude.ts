import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIRequest } from "../types.js";
import { AIProviderAdapter } from "./provider.interface.js";
import { AIProviderError } from "../errors.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_TEXT_MS = 30_000;
const DEFAULT_TIMEOUT_VISION_MS = 60_000;

interface ClaudeMessage {
  role: "user" | "assistant";
  content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: string;
          data: string;
        };
      }
  >;
}

interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: unknown; // JSON Schema
}

interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  tools?: ClaudeToolDefinition[];
  tool_choice?: { type: "tool"; name: string };
}

interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeAdapter implements AIProviderAdapter {
  readonly name = "claude" as const;
  readonly capabilities = {
    images: true,
    video: false,
  } as const;

  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
    this.model = process.env.CLAUDE_MODEL || "claude-sonnet-5";

    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Claude adapter");
    }
  }

  /**
   * Recursively strip JSON Schema fields that Claude doesn't need or may reject.
   * Strips: $schema, definitions, additionalProperties
   * 
   * Must be recursive because nested objects (e.g., properties within properties)
   * can also contain these fields at any depth.
   */
  private stripClaudeIncompatibleFields(schema: any): any {
    if (schema === null || typeof schema !== "object") {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map((item) => this.stripClaudeIncompatibleFields(item));
    }

    // Clone and strip unnecessary keys at this level
    const { $schema, definitions, additionalProperties, ...cleaned } = schema;

    // Recursively clean nested objects
    for (const key of Object.keys(cleaned)) {
      cleaned[key] = this.stripClaudeIncompatibleFields(cleaned[key]);
    }

    return cleaned;
  }

  async call<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>
  ): Promise<{
    raw: unknown;
    modelUsed: string;
    usage?: Record<string, number>;
  }> {
    // Fast-reject video requests before any other processing
    if (request.video) {
      throw new AIProviderError(
        `Claude does not support video input. This request ("${request.taskName}") requires video understanding, which only Gemini currently provides. This is an expected, permanent limitation, not a transient failure.`,
        "claude"
      );
    }

    const startTime = Date.now();
    const hasImages = request.images && request.images.length > 0;
    const timeout = hasImages ? DEFAULT_TIMEOUT_VISION_MS : DEFAULT_TIMEOUT_TEXT_MS;

    // Convert zod schema to JSON Schema for Claude's tool definition
    // Call without 'name' option to get inline schema, not a $ref wrapper
    const rawSchema = zodToJsonSchema(request.responseSchema as any, {
      $refStrategy: "none",
    }) as Record<string, unknown>;

    // Recursively remove JSON Schema meta-fields that may cause issues
    const jsonSchema = this.stripClaudeIncompatibleFields(rawSchema);

    // Build user message content with text + images
    const userContent: ClaudeMessage["content"] = [];

    // Add text first
    userContent.push({
      type: "text",
      text: request.userPrompt,
    });

    // Add images if present
    if (request.images) {
      for (const img of request.images) {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mimeType,
            data: img.base64Data,
          },
        });
      }
    }

    const claudeRequest: ClaudeRequest = {
      model: this.model,
      max_tokens: request.maxOutputTokens || 4096,
      system: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      tools: [
        {
          name: "provide_structured_response",
          description: "Provide the response in the required structured format",
          input_schema: jsonSchema,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "provide_structured_response",
      },
    };

    // Log outbound request (minus API key)
    console.debug("[Claude] Outbound request:", {
      taskName: request.taskName,
      model: this.model,
      hasImages,
      imageCount: request.images?.length || 0,
      systemPromptLength: request.systemPrompt.length,
      userPromptLength: request.userPrompt.length,
      maxTokens: claudeRequest.max_tokens,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(claudeRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Claude] HTTP error response:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new AIProviderError(
          `Claude API HTTP ${response.status}: ${response.statusText}`,
          "claude",
          response.status,
          errorText
        );
      }

      const data = (await response.json()) as ClaudeResponse;
      const latency = Date.now() - startTime;

      // Log inbound response
      console.debug("[Claude] Inbound response:", {
        taskName: request.taskName,
        latencyMs: latency,
        model: data.model,
        usage: data.usage,
        contentBlocks: data.content.length,
      });

      // Extract tool_use block
      const toolUseBlock = data.content.find((block) => block.type === "tool_use");

      if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        throw new AIProviderError(
          "Claude response missing expected tool_use block",
          "claude",
          undefined,
          data
        );
      }

      return {
        raw: toolUseBlock.input,
        modelUsed: data.model,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error("[Claude] Request failed:", {
        taskName: request.taskName,
        latencyMs: latency,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AIProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError(
          `Claude request timeout after ${timeout}ms`,
          "claude",
          undefined,
          error
        );
      }

      throw new AIProviderError(
        `Claude request failed: ${error instanceof Error ? error.message : String(error)}`,
        "claude",
        undefined,
        error
      );
    }
  }

  /**
   * Validate that the API key works with a minimal request
   */
  async validateKey(): Promise<boolean> {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "Hi" }],
            },
          ],
        }),
      });

      return response.ok;
    } catch (error) {
      console.error("[Claude] Key validation failed:", error);
      return false;
    }
  }
}
