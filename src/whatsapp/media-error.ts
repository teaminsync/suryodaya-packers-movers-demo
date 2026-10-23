/**
 * Media error message handling for WhatsApp webhook
 */

import { AIProviderError, AIAllProvidersFailed } from "../ai/errors.js";

export const MEDIA_FAILURE_GENERIC = "Sorry, I had trouble processing that - could you try sending it again?";

export const MEDIA_FAILURE_QUOTA = "I can't analyse photos right now because my photo analysis has reached its limit for the moment. Please try sending it again in a few hours, or write \"talk to a human\" and our team will take it from here.";

/**
 * Check if an error is a quota/rate-limit error (HTTP 429)
 */
export function isQuotaError(error: unknown): boolean {
  try {
    // Check if error has numeric statusCode 429
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof (error as any).statusCode === "number" &&
      (error as any).statusCode === 429
    ) {
      return true;
    }

    // Check if error is AIAllProvidersFailed with all failures having statusCode 429
    if (error instanceof AIAllProvidersFailed) {
      if (error.failures.length === 0) {
        return false;
      }
      return error.failures.every((f) => {
        if (f.error instanceof AIProviderError && f.error.statusCode === 429) {
          return true;
        }
        return false;
      });
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get appropriate user-facing message for a media processing error
 */
export function mediaFailureMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return MEDIA_FAILURE_QUOTA;
  }
  return MEDIA_FAILURE_GENERIC;
}
