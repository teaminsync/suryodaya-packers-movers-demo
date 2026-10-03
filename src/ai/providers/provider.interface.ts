import { z } from "zod";
import { AIRequest, ProviderName } from "../types.js";

export interface AIProviderAdapter {
  readonly name: ProviderName;
  readonly capabilities: {
    readonly images: boolean;
    readonly video: boolean;
  };

  /**
   * Execute an AI request against this provider.
   * Returns raw (unvalidated) JSON response - validation happens centrally in router.
   *
   * @throws {AIProviderError} on HTTP failures, timeouts, or malformed envelopes
   */
  call<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>
  ): Promise<{
    raw: unknown;
    modelUsed: string;
    usage?: Record<string, number>;
  }>;
}
