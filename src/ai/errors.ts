/**
 * Base error for all AI provider-related failures
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: "claude" | "gemini",
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "AIProviderError";
    Object.setPrototypeOf(this, AIProviderError.prototype);
  }
}

/**
 * Thrown when provider response doesn't match expected schema
 */
export class AISchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly provider: "claude" | "gemini",
    public readonly validationErrors: unknown,
    public readonly rawResponse: unknown
  ) {
    super(message);
    this.name = "AISchemaValidationError";
    Object.setPrototypeOf(this, AISchemaValidationError.prototype);
  }
}

/**
 * Thrown when all providers fail (production mode with fallback)
 */
export class AIAllProvidersFailed extends Error {
  constructor(
    public readonly failures: Array<{
      provider: "claude" | "gemini";
      error: Error;
    }>
  ) {
    const summary = failures
      .map((f) => `${f.provider}: ${f.error.message}`)
      .join("; ");
    super(`All AI providers failed: ${summary}`);
    this.name = "AIAllProvidersFailed";
    Object.setPrototypeOf(this, AIAllProvidersFailed.prototype);
  }
}
