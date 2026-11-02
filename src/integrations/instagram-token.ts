/**
 * Pure Instagram token management logic
 */

import { createHash } from "node:crypto";

export interface TokenRow {
  accessToken: string;
  envFingerprint: string;
  refreshedAt: Date | null;
  expiresAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 16);
}

export function parseTokenConfig(env: Record<string, string | undefined>): {
  refreshEveryDays: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const raw = env.INSTAGRAM_TOKEN_REFRESH_DAYS;

  if (raw === undefined || raw.trim() === "") {
    return { refreshEveryDays: 7, warnings };
  }

  const parsed = parseInt(raw, 10);

  if (isNaN(parsed) || parsed < 0 || parsed > 30) {
    warnings.push(`INSTAGRAM_TOKEN_REFRESH_DAYS "${raw}" is invalid (expected 0-30); using default 7`);
    return { refreshEveryDays: 7, warnings };
  }

  return { refreshEveryDays: parsed, warnings };
}

export function needsRefresh(input: {
  refreshedAt: Date | null;
  lastAttemptAt: Date | null;
  now: Date;
  everyDays: number;
}): boolean {
  if (input.everyDays === 0) {
    return false;
  }

  const hoursSinceAttempt = input.lastAttemptAt
    ? (input.now.getTime() - input.lastAttemptAt.getTime()) / (1000 * 60 * 60)
    : Infinity;

  if (hoursSinceAttempt < 23) {
    return false;
  }

  const daysSinceRefresh = input.refreshedAt
    ? (input.now.getTime() - input.refreshedAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  return daysSinceRefresh >= input.everyDays;
}

export function parseRefreshResponse(
  body: unknown,
  now: Date
):
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Unexpected response from Instagram" };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.access_token !== "string" || obj.access_token.trim() === "") {
    return { ok: false, error: "Unexpected response from Instagram" };
  }

  if (typeof obj.expires_in !== "number" || !isFinite(obj.expires_in) || obj.expires_in <= 0) {
    return { ok: false, error: "Unexpected response from Instagram" };
  }

  const expiresAt = new Date(now.getTime() + obj.expires_in * 1000);

  return {
    ok: true,
    token: obj.access_token,
    expiresAt,
  };
}

export function sanitizeError(message: string, token: string | null): string {
  let cleaned = message;

  if (token) {
    cleaned = cleaned.split(token).join("[redacted]");
  }

  cleaned = cleaned.replace(/access_token=[^&\s"']+/gi, "[redacted]");

  return cleaned.trim().substring(0, 200);
}

export function tokenLevel(input: {
  expiresAt: Date | null;
  now: Date;
}):
  | { level: "unknown"; daysLeft: null }
  | { level: "ok" | "warning" | "critical" | "expired"; daysLeft: number } {
  if (input.expiresAt === null) {
    return { level: "unknown", daysLeft: null };
  }

  const daysLeft = Math.floor((input.expiresAt.getTime() - input.now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return { level: "expired", daysLeft };
  }

  if (daysLeft <= 3) {
    return { level: "critical", daysLeft };
  }

  if (daysLeft <= 14) {
    return { level: "warning", daysLeft };
  }

  return { level: "ok", daysLeft };
}

export async function requestRefresh(
  token: string,
  deps: { fetch: typeof fetch; now(): Date }
): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false; error: string }> {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;

  try {
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text();
      const preview = text.substring(0, 150);
      return {
        ok: false,
        error: sanitizeError(`Instagram refused the refresh (HTTP ${response.status}): ${preview}`, token),
      };
    }

    const body = await response.json();
    return parseRefreshResponse(body, deps.now());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: sanitizeError(message, token),
    };
  }
}
