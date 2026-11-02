/**
 * Tests for Instagram token management
 */

import { describe, it, expect } from "@jest/globals";
import {
  tokenFingerprint,
  parseTokenConfig,
  needsRefresh,
  parseRefreshResponse,
  sanitizeError,
  tokenLevel,
  requestRefresh,
} from "../instagram-token.js";

describe("tokenFingerprint", () => {
  it("returns stable 16-character hex string", () => {
    const token = "test-token-123";
    const fp1 = tokenFingerprint(token);
    const fp2 = tokenFingerprint(token);

    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs for different tokens", () => {
    const fp1 = tokenFingerprint("token1");
    const fp2 = tokenFingerprint("token2");

    expect(fp1).not.toBe(fp2);
  });
});

describe("parseTokenConfig", () => {
  it("defaults to 7 days", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({});
    expect(refreshEveryDays).toBe(7);
    expect(warnings).toEqual([]);
  });

  it("accepts 0", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({ INSTAGRAM_TOKEN_REFRESH_DAYS: "0" });
    expect(refreshEveryDays).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("accepts 30", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({ INSTAGRAM_TOKEN_REFRESH_DAYS: "30" });
    expect(refreshEveryDays).toBe(30);
    expect(warnings).toEqual([]);
  });

  it("rejects 31 with warning", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({ INSTAGRAM_TOKEN_REFRESH_DAYS: "31" });
    expect(refreshEveryDays).toBe(7);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("INSTAGRAM_TOKEN_REFRESH_DAYS");
  });

  it("rejects 'abc' with warning", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({ INSTAGRAM_TOKEN_REFRESH_DAYS: "abc" });
    expect(refreshEveryDays).toBe(7);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("INSTAGRAM_TOKEN_REFRESH_DAYS");
  });

  it("treats blank as default", () => {
    const { refreshEveryDays, warnings } = parseTokenConfig({ INSTAGRAM_TOKEN_REFRESH_DAYS: "  " });
    expect(refreshEveryDays).toBe(7);
    expect(warnings).toEqual([]);
  });
});

describe("needsRefresh", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("returns true when never refreshed and never attempted", () => {
    const result = needsRefresh({
      refreshedAt: null,
      lastAttemptAt: null,
      now,
      everyDays: 7,
    });
    expect(result).toBe(true);
  });

  it("returns false when attempted 2 hours ago", () => {
    const lastAttemptAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const result = needsRefresh({
      refreshedAt: null,
      lastAttemptAt,
      now,
      everyDays: 7,
    });
    expect(result).toBe(false);
  });

  it("returns true when refreshed 8 days ago with everyDays 7", () => {
    const refreshedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const result = needsRefresh({
      refreshedAt,
      lastAttemptAt: refreshedAt,
      now,
      everyDays: 7,
    });
    expect(result).toBe(true);
  });

  it("returns false when refreshed 3 days ago", () => {
    const refreshedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const result = needsRefresh({
      refreshedAt,
      lastAttemptAt: refreshedAt,
      now,
      everyDays: 7,
    });
    expect(result).toBe(false);
  });

  it("returns false when everyDays is 0", () => {
    const result = needsRefresh({
      refreshedAt: null,
      lastAttemptAt: null,
      now,
      everyDays: 0,
    });
    expect(result).toBe(false);
  });

  it("returns true when attempted 24 hours ago and refreshed is null", () => {
    const lastAttemptAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const result = needsRefresh({
      refreshedAt: null,
      lastAttemptAt,
      now,
      everyDays: 7,
    });
    expect(result).toBe(true);
  });
});

describe("parseRefreshResponse", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("parses valid response", () => {
    const body = {
      access_token: "new-token-123",
      token_type: "bearer",
      expires_in: 5184000,
    };

    const result = parseRefreshResponse(body, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("new-token-123");
      expect(result.expiresAt.getTime()).toBe(now.getTime() + 5184000 * 1000);
    }
  });

  it("rejects missing token", () => {
    const body = {
      token_type: "bearer",
      expires_in: 5184000,
    };

    const result = parseRefreshResponse(body, now);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unexpected response");
    }
  });

  it("rejects expires_in 0", () => {
    const body = {
      access_token: "new-token",
      expires_in: 0,
    };

    const result = parseRefreshResponse(body, now);

    expect(result.ok).toBe(false);
  });

  it("rejects expires_in as string", () => {
    const body = {
      access_token: "new-token",
      expires_in: "5184000",
    };

    const result = parseRefreshResponse(body, now);

    expect(result.ok).toBe(false);
  });

  it("rejects null body", () => {
    const result = parseRefreshResponse(null, now);

    expect(result.ok).toBe(false);
  });
});

describe("sanitizeError", () => {
  it("removes the token", () => {
    const message = "Error with token SECRET123 in URL";
    const result = sanitizeError(message, "SECRET123");

    expect(result).not.toContain("SECRET123");
    expect(result).toContain("[redacted]");
  });

  it("removes access_token query params", () => {
    const message = "GET /refresh?access_token=SECRET123&grant_type=refresh";
    const result = sanitizeError(message, null);

    expect(result).not.toContain("SECRET123");
    expect(result).toContain("[redacted]");
  });

  it("truncates to 200 chars", () => {
    const message = "a".repeat(300);
    const result = sanitizeError(message, null);

    expect(result.length).toBe(200);
  });
});

describe("tokenLevel", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("returns unknown when expiresAt is null", () => {
    const result = tokenLevel({ expiresAt: null, now });

    expect(result.level).toBe("unknown");
    expect(result.daysLeft).toBe(null);
  });

  it("returns expired when daysLeft is 0", () => {
    const expiresAt = new Date(now);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("expired");
    expect(result.daysLeft).toBe(0);
  });

  it("returns expired when daysLeft is negative", () => {
    const expiresAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("expired");
    expect(result.daysLeft).toBe(-1);
  });

  it("returns critical when daysLeft is 3", () => {
    const expiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("critical");
    expect(result.daysLeft).toBe(3);
  });

  it("returns warning when daysLeft is 4", () => {
    const expiresAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("warning");
    expect(result.daysLeft).toBe(4);
  });

  it("returns warning when daysLeft is 14", () => {
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("warning");
    expect(result.daysLeft).toBe(14);
  });

  it("returns ok when daysLeft is 15", () => {
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const result = tokenLevel({ expiresAt, now });

    expect(result.level).toBe("ok");
    expect(result.daysLeft).toBe(15);
  });
});

describe("requestRefresh", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("returns success with valid response", async () => {
    const fakeFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "refreshed-token",
          expires_in: 5184000,
        }),
      } as Response);

    const result = await requestRefresh("old-token", {
      fetch: fakeFetch,
      now: () => now,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("refreshed-token");
      expect(result.expiresAt.getTime()).toBe(now.getTime() + 5184000 * 1000);
    }
  });

  it("returns error on HTTP 400 and sanitizes token from body", async () => {
    const fakeFetch = async () =>
      ({
        ok: false,
        status: 400,
        text: async () => "Error: invalid token=old-token",
      } as Response);

    const result = await requestRefresh("old-token", {
      fetch: fakeFetch,
      now: () => now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("400");
      expect(result.error).not.toContain("old-token");
      expect(result.error).toContain("[redacted]");
    }
  });

  it("returns error on network throw and sanitizes", async () => {
    const fakeFetch = async () => {
      throw new Error("Network failure with token old-token in URL");
    };

    const result = await requestRefresh("old-token", {
      fetch: fakeFetch,
      now: () => now,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("old-token");
      expect(result.error).toContain("[redacted]");
    }
  });
});
