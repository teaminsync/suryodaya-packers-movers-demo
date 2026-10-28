/**
 * Survey settings database operations and singleton provider
 */

import { sql } from "../leads/db.js";
import type { StoredSurveySettings } from "./settings.js";
import { createSurveyConfigProvider } from "./settings.js";

/**
 * Load stored survey settings from the database
 */
export async function loadStoredSurveySettings(): Promise<StoredSurveySettings | null> {
  try {
    const rows = await sql<
      Array<{ settings: string; updated_by: string | null; updated_at: Date }>
    >`
      SELECT settings, updated_by, updated_at
      FROM survey_settings
      WHERE id = 'default'
    `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    let parsed: unknown;

    try {
      parsed = JSON.parse(row.settings);
    } catch {
      console.warn("[Survey settings] Failed to parse stored settings JSON");
      return null;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      console.warn("[Survey settings] Stored settings is not a plain object");
      return null;
    }

    const values: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        values[key] = value;
      }
    }

    return {
      values,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  } catch (error: any) {
    // Postgres error code 42P01 = relation does not exist
    if (error?.code === "42P01") {
      return null;
    }
    throw error;
  }
}

/**
 * Save survey settings to the database
 */
export async function saveSurveySettings(
  values: Record<string, string>,
  updatedBy: string | null
): Promise<void> {
  const settingsJson = JSON.stringify(values);

  await sql`
    INSERT INTO survey_settings (id, settings, updated_by, updated_at)
    VALUES ('default', ${settingsJson}, ${updatedBy}, now())
    ON CONFLICT (id)
    DO UPDATE SET
      settings = EXCLUDED.settings,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
}

/**
 * Reset survey settings (delete the stored row)
 */
export async function resetSurveySettings(): Promise<void> {
  await sql`
    DELETE FROM survey_settings WHERE id = 'default'
  `;
}

/**
 * Singleton survey config provider
 */
export const surveyConfigProvider = createSurveyConfigProvider({
  env: process.env,
  loadStored: loadStoredSurveySettings,
  now: () => new Date(),
  warn: (m, d) => console.warn("[Survey settings]", m, d ?? ""),
});
