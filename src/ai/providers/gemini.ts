import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIRequest } from "../types.js";
import { AIProviderAdapter } from "./provider.interface.js";
import { AIProviderError } from "../errors.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_TEXT_MS = 30_000;
const DEFAULT_TIMEOUT_VISION_MS = 60_000;
const DEFAULT_TIMEOUT_VIDEO_GENERATE_MS = 120_000; // video generateContent call, after file is ACTIVE

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
  file_data?: {
    mime_type: string;
    file_uri: string;
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

interface GeminiFileUploadResponse {
  file: {
    name: string;
    uri: string;
    mimeType: string;
    sizeBytes?: string;
  };
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

  /**
   * Recursively strip JSON Schema fields that Gemini rejects.
   * Gemini supports: type, properties, items, required, enum
   * Gemini rejects: $schema, definitions, additionalProperties
   * Gemini also requires type to be a single string, not an array
   * 
   * Must be recursive because nested objects (e.g., properties within properties)
   * can also contain these forbidden fields at any depth.
   */
  private stripGeminiIncompatibleFields(schema: any): any {
    if (schema === null || typeof schema !== "object") {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map((item) => this.stripGeminiIncompatibleFields(item));
    }

    // Clone and strip forbidden keys at this level
    const { $schema, definitions, additionalProperties, ...cleaned } = schema;

    // Fix type arrays (e.g., ["string", "null"]) - Gemini doesn't support this
    // For nullable fields, zod-to-json-schema generates type: ["string", "null"]
    // We need to convert this to just the non-null type
    if (Array.isArray(cleaned.type)) {
      const types = cleaned.type.filter((t: string) => t !== "null");
      if (types.length === 1) {
        cleaned.type = types[0];
      } else if (types.length > 1) {
        // Multiple non-null types - pick the first one (shouldn't happen in our schemas)
        cleaned.type = types[0];
      }
      // If the field was nullable, we lose that constraint, but Gemini will still work
    }

    // Recursively clean nested objects
    for (const key of Object.keys(cleaned)) {
      cleaned[key] = this.stripGeminiIncompatibleFields(cleaned[key]);
    }

    return cleaned;
  }

  /**
   * Poll file status until it reaches ACTIVE state
   */
  private async waitForFileActive(fileName: string, maxWaitMs: number = 120_000): Promise<void> {
    const pollIntervalMs = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const statusUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${this.apiKey}`;
      const response = await fetch(statusUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIProviderError(
          `Gemini file status check failed: HTTP ${response.status}`,
          "gemini",
          response.status,
          errorText
        );
      }

      const fileInfo = (await response.json()) as { state?: string };
      console.debug("[Gemini] File processing status:", { fileName, state: fileInfo.state });

      if (fileInfo.state === "ACTIVE") {
        return;
      }
      if (fileInfo.state === "FAILED") {
        throw new AIProviderError(
          `Gemini file processing failed for ${fileName}`,
          "gemini",
          undefined,
          fileInfo
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new AIProviderError(
      `Gemini file ${fileName} did not become ACTIVE within ${maxWaitMs}ms`,
      "gemini"
    );
  }

  /**
   * Upload video to Gemini Files API using resumable upload protocol
   * Returns the file URI for use in generateContent
   */
  private async uploadVideoFile(base64Data: string, taskName: string): Promise<string> {
    const videoBuffer = Buffer.from(base64Data, "base64");
    const contentLength = videoBuffer.length;

    // Step 1: Initiate resumable upload
    const initiateUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.apiKey}`;
    
    console.debug("[Gemini] Initiating video upload:", {
      taskName,
      contentLength,
      displayName: `video_${taskName}_${Date.now()}`,
    });

    const initiateResponse = await fetch(initiateUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(contentLength),
        "X-Goog-Upload-Header-Content-Type": "video/mp4",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: {
          display_name: `video_${taskName}_${Date.now()}`,
        },
      }),
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      console.error("[Gemini] Video upload initiation failed:", {
        status: initiateResponse.status,
        statusText: initiateResponse.statusText,
        body: errorText,
      });
      throw new AIProviderError(
        `Gemini video upload initiation failed: HTTP ${initiateResponse.status}`,
        "gemini",
        initiateResponse.status,
        errorText
      );
    }

    const uploadUrl = initiateResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new AIProviderError(
        "Gemini video upload initiation response missing x-goog-upload-url header",
        "gemini",
        undefined,
        initiateResponse.headers
      );
    }

    console.debug("[Gemini] Video upload URL obtained:", { uploadUrl: uploadUrl.substring(0, 80) + "..." });

    // Step 2: Upload video bytes and finalize
    console.debug("[Gemini] Uploading video bytes...");

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(contentLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: videoBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("[Gemini] Video upload failed:", {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        body: errorText,
      });
      throw new AIProviderError(
        `Gemini video upload failed: HTTP ${uploadResponse.status}`,
        "gemini",
        uploadResponse.status,
        errorText
      );
    }

    const uploadResult = (await uploadResponse.json()) as GeminiFileUploadResponse;
    console.debug("[Gemini] Video upload complete:", {
      fileUri: uploadResult.file?.uri,
      fileName: uploadResult.file?.name,
    });

    if (!uploadResult.file?.uri || !uploadResult.file?.name) {
      throw new AIProviderError(
        "Gemini video upload response missing file.uri or file.name",
        "gemini",
        undefined,
        uploadResult
      );
    }

    // Wait for file to become ACTIVE before using it
    await this.waitForFileActive(uploadResult.file.name);

    return uploadResult.file.uri;
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
    const hasVideo = !!request.video;
    const timeout = hasVideo ? DEFAULT_TIMEOUT_VIDEO_GENERATE_MS 
                  : (hasImages ? DEFAULT_TIMEOUT_VISION_MS : DEFAULT_TIMEOUT_TEXT_MS);

    // Convert zod schema to JSON Schema
    // Call without 'name' option to get inline schema, not a $ref wrapper
    const rawSchema = zodToJsonSchema(request.responseSchema as any, {
      $refStrategy: "none",
    }) as Record<string, unknown>;

    // Recursively remove all JSON Schema fields that Gemini doesn't accept
    const jsonSchema = this.stripGeminiIncompatibleFields(rawSchema);
    
    // LOG: What's actually being sent to Gemini? (one-time evidence for nested strip fix)
    console.debug("[Gemini] Schema sent to API:", JSON.stringify(jsonSchema, null, 2));

    // Upload video if present (Files API required for video)
    let videoFileUri: string | undefined;
    if (request.video) {
      videoFileUri = await this.uploadVideoFile(request.video.base64Data, request.taskName);
    }

    // Build user content parts: text + images + video
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

    // Add video if present (via Files API file_uri)
    if (videoFileUri) {
      userParts.push({
        file_data: {
          mime_type: "video/mp4",
          file_uri: videoFileUri,
        },
      });
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
      hasVideo,
      imageCount: request.images?.length || 0,
      videoFileUri: videoFileUri || null,
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
