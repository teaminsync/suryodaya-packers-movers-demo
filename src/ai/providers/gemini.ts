import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIRequest } from "../types.js";
import { AIProviderAdapter } from "./provider.interface.js";
import { AIProviderError } from "../errors.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_TEXT_MS = 30_000;
const DEFAULT_TIMEOUT_VISION_MS = 60_000;

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: { text: string }[];
  };
  generationConfig: {
    maxOutputTokens?: number;
    responseMimeType: string;
    responseSchema: unknown; // JSON Schema
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

export class GeminiAdapter implements AIProviderAdapter {
  readonly name = "gemini" as const;

  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required for Gemini adapter");
    }
  }

  async call<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>
  ): Promise<{
    raw: unknown;
    modelUsed: string;
    usage?: Record<string, number>;
  }> {
    const startTime = Date.now();
    const hasImages = request.images && request.images.length > 0;
    const timeout = hasImages ? DEFAULT_TIMEOUT_VISION_MS : DEFAULT_TIMEOUT_TEXT_MS;

    // Convert zod schema to JSON Schema
    // Call without 'name' option to get inline schema, not a $ref wrapper
    const rawSchema = zodToJsonSchema(request.responseSchema as any, {
      $refStrategy: "none",
    }) as Record<string, unknown>;

    // Remove JSON Schema fields that Gemini doesn't accept
    // Gemini supports: type, properties, items, required, enum
    // Gemini rejects: $schema, definitions, additionalProperties
    const { $schema, definitions, additionalProperties, ...jsonSchema } = rawSchema;
    
    // LOG: What's actually being sent to Gemini?
    console.debug("[Gemini] Schema sent to API:", JSON.stringify(jsonSchema, null, 2));

    // Build user content parts: text + images
    const userParts: GeminiPart[] = [];

    // Add text first
    userParts.push({
      text: request.userPrompt,
    });

    // Add images if present
    if (request.images) {
      for (const img of request.images) {
        userParts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: img.base64Data,
          },
        });
      }
    }

    const geminiRequest: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: request.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens || 4096,
        responseMimeType: "application/json",
        responseSchema: jsonSchema,
      },
    };

    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    // Log outbound request (minus API key)
    console.debug("[Gemini] Outbound request:", {
      taskName: request.taskName,
      model: this.model,
      hasImages,
      imageCount: request.images?.length || 0,
      systemPromptLength: request.systemPrompt.length,
      userPromptLength: request.userPrompt.length,
      maxTokens: geminiRequest.generationConfig.maxOutputTokens,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(geminiRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Gemini] HTTP error response:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new AIProviderError(
          `Gemini API HTTP ${response.status}: ${response.statusText}`,
          "gemini",
          response.status,
          errorText
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const latency = Date.now() - startTime;

      // Log inbound response
      console.debug("[Gemini] Inbound response:", {
        taskName: request.taskName,
        latencyMs: latency,
        model: data.modelVersion || this.model,
        usage: data.usageMetadata,
        candidatesCount: data.candidates?.length || 0,
      });

      // Extract JSON from response
      if (!data.candidates || data.candidates.length === 0) {
        throw new AIProviderError(
          "Gemini response missing candidates",
          "gemini",
          undefined,
          data
        );
      }

      const candidate = data.candidates[0];
      if (!candidate.content?.parts || candidate.content.parts.length === 0) {
        throw new AIProviderError(
          "Gemini response missing content parts",
          "gemini",
          undefined,
          data
        );
      }

      const textPart = candidate.content.parts[0];
      if (!textPart.text) {
        throw new AIProviderError(
          "Gemini response missing text in first part",
          "gemini",
          undefined,
          data
        );
      }

      // Parse the JSON text
      let parsed: unknown;
      try {
        parsed = JSON.parse(textPart.text);
      } catch (parseError) {
        throw new AIProviderError(
          `Gemini returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          "gemini",
          undefined,
          textPart.text
        );
      }

      return {
        raw: parsed,
        modelUsed: data.modelVersion || this.model,
        usage: data.usageMetadata
          ? {
              inputTokens: data.usageMetadata.promptTokenCount,
              outputTokens: data.usageMetadata.candidatesTokenCount,
            }
          : undefined,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      console.error("[Gemini] Request failed:", {
        taskName: request.taskName,
        latencyMs: latency,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AIProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError(
          `Gemini request timeout after ${timeout}ms`,
          "gemini",
          undefined,
          error
        );
      }

      throw new AIProviderError(
        `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`,
        "gemini",
        undefined,
        error
      );
    }
  }
}
