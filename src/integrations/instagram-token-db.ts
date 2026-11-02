/**
 * Database wiring for Instagram token management
 */

import { sql } from "../leads/db.js";
import {
  tokenFingerprint,
  parseTokenConfig,
  needsRefresh,
  requestRefresh,
  sanitizeError,
  tokenLevel,
  type TokenRow,
} from "./instagram-token.js";

async function loadRow(): Promise<TokenRow | undefined> {
  const rows = await sql<
    {
      access_token: string;
      env_fingerprint: string;
      refreshed_at: string | null;
      expires_at: string | null;
      last_attempt_at: string | null;
      last_error: string | null;
    }[]
  >`
    SELECT access_token, env_fingerprint, refreshed_at, expires_at, last_attempt_at, last_error
    FROM integration_tokens
    WHERE provider = 'instagram'
  `;

  if (rows.length === 0) {
    return undefined;
  }

  const row = rows[0];

  return {
    accessToken: row.access_token,
    envFingerprint: row.env_fingerprint,
    refreshedAt: row.refreshed_at ? new Date(row.refreshed_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    lastError: row.last_error,
  };
}

async function ensureSeeded(envToken: string): Promise<void> {
  const fingerprint = tokenFingerprint(envToken);
  const row = await loadRow();

  if (!row || row.envFingerprint !== fingerprint) {
    const now = new Date().toISOString();

    await sql`
      INSERT INTO integration_tokens (provider, access_token, env_fingerprint, refreshed_at, expires_at, last_attempt_at, last_error, updated_at)
      VALUES ('instagram', ${envToken}, ${fingerprint}, NULL, NULL, NULL, NULL, ${now})
      ON CONFLICT (provider)
      DO UPDATE SET
        access_token = ${envToken},
        env_fingerprint = ${fingerprint},
        refreshed_at = NULL,
        expires_at = NULL,
        last_attempt_at = NULL,
        last_error = NULL,
        updated_at = ${now}
    `;
  }
}

let cachedToken: { token: string; cachedAt: number } | null = null;

export async function getInstagramAccessToken(): Promise<string | undefined> {
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!envToken) {
    return undefined;
  }

  try {
    const now = Date.now();
    if (cachedToken && now - cachedToken.cachedAt < 60000) {
      return cachedToken.token;
    }

    const row = await loadRow();

    if (row && row.envFingerprint === tokenFingerprint(envToken)) {
      cachedToken = { token: row.accessToken, cachedAt: now };
      return row.accessToken;
    }

    cachedToken = { token: envToken, cachedAt: now };
    return envToken;
  } catch (error) {
    // On any database error, return env token
    return envToken;
  }
}

export async function runInstagramTokenMaintenance(opts?: {
  force?: boolean;
}): Promise<{ ok: boolean; skipped: boolean; error: string | null }> {
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const isDryRun = process.env.INSTAGRAM_DRY_RUN === "true";

  if (!envToken || isDryRun) {
    return { ok: true, skipped: true, error: null };
  }

  await ensureSeeded(envToken);

  const row = await loadRow();
  if (!row) {
    return { ok: false, skipped: false, error: "Token row not found after seeding" };
  }

  const now = new Date();
  const { refreshEveryDays } = parseTokenConfig(process.env);

  const shouldRefresh =
    opts?.force ||
    needsRefresh({
      refreshedAt: row.refreshedAt,
      lastAttemptAt: row.lastAttemptAt,
      now,
      everyDays: refreshEveryDays,
    });

  if (!shouldRefresh) {
    return { ok: true, skipped: true, error: null };
  }

  // For forced refresh, reject if refreshed less than 24 hours ago
  if (opts?.force) {
    if (
      row.lastAttemptAt &&
      row.refreshedAt &&
      now.getTime() - row.lastAttemptAt.getTime() < 23 * 60 * 60 * 1000 &&
      now.getTime() - row.refreshedAt.getTime() < 23 * 60 * 60 * 1000
    ) {
      return {
        ok: false,
        skipped: false,
        error: "Refreshed less than 24 hours ago; try again later",
      };
    }
  }

  const result = await requestRefresh(row.accessToken, {
    fetch: globalThis.fetch,
    now: () => now,
  });

  const nowIso = now.toISOString();

  if (result.ok) {
    const newFingerprint = tokenFingerprint(result.token);

    await sql`
      UPDATE integration_tokens
      SET access_token = ${result.token},
          env_fingerprint = ${newFingerprint},
          refreshed_at = ${nowIso},
          expires_at = ${result.expiresAt.toISOString()},
          last_attempt_at = ${nowIso},
          last_error = NULL,
          updated_at = ${nowIso}
      WHERE provider = 'instagram'
    `;

    // Invalidate cache
    cachedToken = null;

    return { ok: true, skipped: false, error: null };
  } else {
    await sql`
      UPDATE integration_tokens
      SET last_attempt_at = ${nowIso},
          last_error = ${result.error},
          updated_at = ${nowIso}
      WHERE provider = 'instagram'
    `;

    return { ok: false, skipped: false, error: result.error };
  }
}

export async function getInstagramTokenStatus(): Promise<{
  configured: boolean;
  source: "database" | "env";
  level: string;
  daysLeft: number | null;
  expiresAt: string | null;
  refreshedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}> {
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const configured = !!envToken;

  if (!configured) {
    return {
      configured: false,
      source: "env",
      level: "unknown",
      daysLeft: null,
      expiresAt: null,
      refreshedAt: null,
      lastAttemptAt: null,
      lastError: null,
    };
  }

  try {
    const row = await loadRow();

    if (!row || row.envFingerprint !== tokenFingerprint(envToken)) {
      return {
        configured: true,
        source: "env",
        level: "unknown",
        daysLeft: null,
        expiresAt: null,
        refreshedAt: null,
        lastAttemptAt: null,
        lastError: null,
      };
    }

    const now = new Date();
    const { level, daysLeft } = tokenLevel({ expiresAt: row.expiresAt, now });

    return {
      configured: true,
      source: "database",
      level,
      daysLeft,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      refreshedAt: row.refreshedAt ? row.refreshedAt.toISOString() : null,
      lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
      lastError: row.lastError,
    };
  } catch (error) {
    return {
      configured: true,
      source: "env",
      level: "unknown",
      daysLeft: null,
      expiresAt: null,
      refreshedAt: null,
      lastAttemptAt: null,
      lastError: null,
    };
  }
}

export function startInstagramTokenJob(): void {
  const { refreshEveryDays, warnings } = parseTokenConfig(process.env);

  for (const warning of warnings) {
    console.warn("[Instagram token]", warning);
  }

  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const isDryRun = process.env.INSTAGRAM_DRY_RUN === "true";

  if (!envToken || isDryRun) {
    return;
  }

  if (refreshEveryDays === 0) {
    console.log("[Instagram token] automatic refresh off");
    return;
  }

  console.log(`[Instagram token] refresh job on: every ${refreshEveryDays} days`);

  const run = async () => {
    try {
      const result = await runInstagramTokenMaintenance();

      if (!result.skipped) {
        if (result.ok) {
          const status = await getInstagramTokenStatus();
          console.log(
            `[Instagram token] refreshed, valid for ${status.daysLeft ?? "?"} more days`
          );
        } else {
          const sanitized = sanitizeError(result.error ?? "unknown error", null);
          console.error(`[Instagram token] refresh failed: ${sanitized}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const sanitized = sanitizeError(message, null);
      console.error(`[Instagram token] refresh error: ${sanitized}`);
    }
  };

  // First run after 45 seconds
  setTimeout(() => {
    void run();
  }, 45000);

  // Then every 6 hours
  setInterval(() => {
    void run();
  }, 6 * 60 * 60 * 1000);
}
