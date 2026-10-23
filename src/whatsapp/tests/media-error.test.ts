/**
 * Tests for media-error.ts
 */

import {
  isQuotaError,
  mediaFailureMessage,
  MEDIA_FAILURE_QUOTA,
  MEDIA_FAILURE_GENERIC,
} from "../media-error.js";
import { AIProviderError, AIAllProvidersFailed } from "../../ai/errors.js";

describe("media-error", () => {
  describe("isQuotaError", () => {
    it("should return true for AIProviderError with statusCode 429", () => {
      const error = new AIProviderError("Rate limited", "gemini", 429);
      expect(isQuotaError(error)).toBe(true);
    });

    it("should return true for AIAllProvidersFailed with all failures having statusCode 429", () => {
      const error = new AIAllProvidersFailed([
        { provider: "groq", error: new AIProviderError("Rate limited", "groq", 429) },
        { provider: "gemini", error: new AIProviderError("Rate limited", "gemini", 429) },
      ]);
      expect(isQuotaError(error)).toBe(true);
    });

    it("should return false for AIAllProvidersFailed with mixed status codes", () => {
      const error = new AIAllProvidersFailed([
        { provider: "groq", error: new AIProviderError("Rate limited", "groq", 429) },
        { provider: "gemini", error: new AIProviderError("Server error", "gemini", 503) },
      ]);
      expect(isQuotaError(error)).toBe(false);
    });

    it("should return false for AIProviderError with statusCode 503", () => {
      const error = new AIProviderError("Server error", "gemini", 503);
      expect(isQuotaError(error)).toBe(false);
    });

    it("should return false for plain Error", () => {
      const error = new Error("Something went wrong");
      expect(isQuotaError(error)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isQuotaError(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isQuotaError(undefined)).toBe(false);
    });

    it("should return false for string", () => {
      expect(isQuotaError("error message")).toBe(false);
    });

    it("should return false for number", () => {
      expect(isQuotaError(429)).toBe(false);
    });
  });

  describe("mediaFailureMessage", () => {
    it("should return quota message for AIProviderError with statusCode 429", () => {
      const error = new AIProviderError("Rate limited", "gemini", 429);
      expect(mediaFailureMessage(error)).toBe(MEDIA_FAILURE_QUOTA);
    });

    it("should return quota message for AIAllProvidersFailed with all 429", () => {
      const error = new AIAllProvidersFailed([
        { provider: "groq", error: new AIProviderError("Rate limited", "groq", 429) },
        { provider: "gemini", error: new AIProviderError("Rate limited", "gemini", 429) },
      ]);
      expect(mediaFailureMessage(error)).toBe(MEDIA_FAILURE_QUOTA);
    });

    it("should return generic message for AIAllProvidersFailed with mixed codes", () => {
      const error = new AIAllProvidersFailed([
        { provider: "groq", error: new AIProviderError("Rate limited", "groq", 429) },
        { provider: "gemini", error: new AIProviderError("Server error", "gemini", 503) },
      ]);
      expect(mediaFailureMessage(error)).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for AIProviderError with statusCode 503", () => {
      const error = new AIProviderError("Server error", "gemini", 503);
      expect(mediaFailureMessage(error)).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for plain Error", () => {
      const error = new Error("Something went wrong");
      expect(mediaFailureMessage(error)).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for null", () => {
      expect(mediaFailureMessage(null)).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for undefined", () => {
      expect(mediaFailureMessage(undefined)).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for string", () => {
      expect(mediaFailureMessage("error")).toBe(MEDIA_FAILURE_GENERIC);
    });

    it("should return generic message for number", () => {
      expect(mediaFailureMessage(429)).toBe(MEDIA_FAILURE_GENERIC);
    });
  });
});
