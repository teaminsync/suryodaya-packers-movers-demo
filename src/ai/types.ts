import { z } from "zod";

/**
 * A single image input, provider-agnostic
 */
export interface AIImageInput {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64Data: string; // raw base64, no data-URI prefix
}

/**
 * The canonical request every call site constructs
 */
export interface AIRequest<TSchema extends z.ZodTypeAny> {
  systemPrompt: string;
  userPrompt: string;
  images?: AIImageInput[];
  responseSchema: TSchema; // zod schema describing expected JSON shape
  maxOutputTokens?: number; // default sane value if omitted
  taskName: string; // e.g. "lead_qualification", "volumetric_estimate" — for logging
}

/**
 * The canonical response, after validation
 */
export interface AIResponse<T> {
  data: T; // parsed + validated against responseSchema
  providerUsed: "claude" | "gemini";
  modelUsed: string;
  wasFailover: boolean; // true if primary failed and fallback served this
  latencyMs: number;
  rawUsage?: { inputTokens?: number; outputTokens?: number };
}
