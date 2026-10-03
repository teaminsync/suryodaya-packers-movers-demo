import { ProviderName } from "./types.js";

/**
 * Base error for all AI provider-related failures
 */
export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderName,
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
    public readonly provider: ProviderName,
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
      provider: ProviderName;
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

/**
 * Thrown when no provider in the chain has the required capabilities
 */
export class AINoCapableProviderError extends Error {
  constructor(public readonly needs: string[]) {
    const needsList = needs.join(", ");
    super(`No provider in the chain supports the required capabilities: ${needsList}`);
    this.name = "AINoCapableProviderError";
    Object.setPrototypeOf(this, AINoCapableProviderError.prototype);
  }
}
