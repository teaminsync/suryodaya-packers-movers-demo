import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AIRequest } from "../types.js";
import { AIProviderAdapter } from "./provider.interface.js";
import { AIProviderError } from "../errors.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  response_format: {
    type: "json_object";
  };
  max_completion_tokens: number;
}

interface GroqResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class GroqAdapter implements AIProviderAdapter {
  readonly name = "groq" as const;
  readonly capabilities = {
    images: false,
    video: false,
  } as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly retryDelaysMs: number[];
  private readonly maxRetryAfterMs: number;

  constructor(options?: { retryDelaysMs?: number[]; maxRetryAfterMs?: number }) {
    this.apiKey = process.env.GROQ_API_KEY || "";
    this.model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    this.retryDelaysMs = options?.retryDelaysMs || [1000, 2500];
    this.maxRetryAfterMs = options?.maxRetryAfterMs || 5000;

    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is required for Groq adapter");
    }
  }

  async call<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>
  ): Promise<{
    raw: z.infer<TSchema>;
    modelUsed: string;
    usage?: Record<string, number>;
  }> {
    const startTime = Date.now();

    // Reject image/video requests before any network call
    if (request.images?.length || request.video) {
      throw new AIProviderError(
        "Groq adapter does not support image or video input",
        "groq"
      );
    }

    // Build JSON schema
    const jsonSchema = zodToJsonSchema(request.responseSchema as any, {
      $refStrategy: "none",
    });
    delete jsonSchema.$schema;

    const addendum = `Respond with a single JSON object (no markdown, no commentary) that conforms to this JSON Schema. Include every required key. For optional keys you have no value for, OMIT the key entirely; never use null for them.\nJSON Schema:\n${JSON.stringify(jsonSchema)}`;

    const groqRequest: GroqRequest = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: `${request.systemPrompt}\n\n${addendum}`,
        },
        {
          role: "user",
          content: request.userPrompt,
        },
      ],
      response_format: {
        type: "json_object",
      },
      max_completion_tokens: request.maxOutputTokens || 4096,
    };

    console.debug("[Groq] Outbound request:", {
      taskName: request.taskName,
      model: this.model,
      systemPromptLength: request.systemPrompt.length,
      userPromptLength: request.userPrompt.length,
      maxTokens: groqRequest.max_completion_tokens,
    });

    const maxAttempts = 1 + this.retryDelaysMs.length;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(groqRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Log rate limit headers
        console.info("[Groq] Rate limit headers:", {
          taskName: request.taskName,
          status: response.status,
          limitRequests: response.headers.get("x-ratelimit-limit-requests"),
          limitTokens: response.headers.get("x-ratelimit-limit-tokens"),
          remainingRequests: response.headers.get("x-ratelimit-remaining-requests"),
          remainingTokens: response.headers.get("x-ratelimit-remaining-tokens"),
          resetRequests: response.headers.get("x-ratelimit-reset-requests"),
          resetTokens: response.headers.get("x-ratelimit-reset-tokens"),
          retryAfter: response.headers.get("retry-after"),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[Groq] HTTP error response:", {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });

          const isRetryable = [429, 500, 502, 503, 504].includes(response.status);

          if (isRetryable && attempt < maxAttempts) {
            let delayMs = this.retryDelaysMs[attempt - 1];

            // Handle 429 with retry-after header
            if (response.status === 429) {
              const retryAfter = response.headers.get("retry-after");
              if (retryAfter) {
                const retryAfterSeconds = parseFloat(retryAfter);
                if (!isNaN(retryAfterSeconds)) {
                  const retryAfterMs = retryAfterSeconds * 1000;
                  if (retryAfterMs > this.maxRetryAfterMs) {
                    // Don't retry - retry-after exceeds max
                    const error = new AIProviderError(
                      `Groq API HTTP ${response.status}: ${response.statusText}`,
                      "groq",
                      response.status,
                      errorText
                    );
                    console.error("[Groq] Request failed:", {
                      taskName: request.taskName,
                      latencyMs: Date.now() - startTime,
                      error: error.message,
                    });
                    throw error;
                  }
                  delayMs = retryAfterMs;
                }
              }
            }

            console.warn(
              `[Groq] Retryable HTTP ${response.status} on attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms`,
              { taskName: request.taskName }
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          // Non-retryable or final attempt
          const error = new AIProviderError(
            `Groq API HTTP ${response.status}: ${response.statusText}`,
            "groq",
            response.status,
            errorText
          );
          console.error("[Groq] Request failed:", {
            taskName: request.taskName,
            latencyMs: Date.now() - startTime,
            error: error.message,
          });
          throw error;
        }

        // Success response
        const data = (await response.json()) as GroqResponse;
        const latency = Date.now() - startTime;

        console.debug("[Groq] Inbound response:", {
          taskName: request.taskName,
          latencyMs: latency,
          model: data.model,
          usage: data.usage,
        });

        // Validate response structure
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          const error = new AIProviderError(
            `Groq response missing content (finish_reason: ${data.choices?.[0]?.finish_reason})`,
            "groq",
            undefined,
            data
          );
          console.error("[Groq] Request failed:", {
            taskName: request.taskName,
            latencyMs: Date.now() - startTime,
            error: error.message,
          });
          throw error;
        }

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch (parseError) {
          const error = new AIProviderError(
            `Groq returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            "groq",
            undefined,
            content
          );
          console.error("[Groq] Request failed:", {
            taskName: request.taskName,
            latencyMs: Date.now() - startTime,
            error: error.message,
          });
          throw error;
        }

        // Return result
        return {
          raw: parsed as z.infer<TSchema>,
          modelUsed: data.model || this.model,
          usage: data.usage
            ? {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
              }
            : undefined,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        // Handle abort/timeout
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = new AIProviderError(
            `Groq request timeout after ${DEFAULT_TIMEOUT_MS}ms`,
            "groq"
          );
          console.error("[Groq] Request failed:", {
            taskName: request.taskName,
            latencyMs: Date.now() - startTime,
            error: timeoutError.message,
          });
          throw timeoutError;
        }

        // AIProviderError already thrown from above
        if (error instanceof AIProviderError) {
          throw error;
        }

        // Generic network error
        lastError = error instanceof Error ? error : new Error(String(error));
        const providerError = new AIProviderError(
          `Groq request failed: ${lastError.message}`,
          "groq",
          undefined,
          lastError
        );
        console.error("[Groq] Request failed:", {
          taskName: request.taskName,
          latencyMs: Date.now() - startTime,
          error: providerError.message,
        });
        throw providerError;
      }
    }

    // Should not reach here
    const finalError = new AIProviderError(
      `Groq request failed after ${maxAttempts} attempts`,
      "groq",
      undefined,
      lastError
    );
    console.error("[Groq] Request failed:", {
      taskName: request.taskName,
      latencyMs: Date.now() - startTime,
      error: finalError.message,
    });
    throw finalError;
  }
}
