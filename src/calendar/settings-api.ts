/**
 * Survey settings API layer: pure HTTP orchestration
 */

import type { ApiResponse } from "../outreach/http.js";
import type { EffectiveSurveySettings } from "./settings.js";
import { validateSurveySettingsInput, configToEnvStrings } from "./settings.js";

interface SurveySettingsApiDeps {
  getEffective(): Promise<EffectiveSurveySettings>;
  save(values: Record<string, string>, updatedBy: string | null): Promise<void>;
  reset(): Promise<void>;
  invalidate(): void;
}

export function createSurveySettingsApi(deps: SurveySettingsApiDeps) {
  async function getSettings(): Promise<ApiResponse> {
    const effective = await deps.getEffective();

    return {
      status: 200,
      json: {
        ok: true,
        values: configToEnvStrings(effective.config),
        source: effective.source,
        updatedAt: effective.updatedAt,
        updatedBy: effective.updatedBy,
        warnings: effective.warnings,
      },
    };
  }

  async function putSettings(body: unknown): Promise<ApiResponse> {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return {
        status: 400,
        json: {
          ok: false,
          code: "invalid",
          errors: ["Body must be an object with a 'values' property"],
        },
      };
    }

    const obj = body as Record<string, unknown>;

    if (!obj.values) {
      return {
        status: 400,
        json: {
          ok: false,
          code: "invalid",
          errors: ["Missing 'values' property"],
        },
      };
    }

    const validated = validateSurveySettingsInput(obj.values);

    if (!validated.ok) {
      return {
        status: 400,
        json: {
          ok: false,
          code: "invalid",
          errors: validated.errors,
        },
      };
    }

    let staff: string | null = null;

    if (typeof obj.staff === "string") {
      const trimmed = obj.staff
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80)
        .trim();

      staff = trimmed || null;
    }

    await deps.save(validated.values, staff);
    deps.invalidate();

    const effective = await deps.getEffective();

    return {
      status: 200,
      json: {
        ok: true,
        values: configToEnvStrings(effective.config),
        source: effective.source,
        updatedAt: effective.updatedAt,
        updatedBy: effective.updatedBy,
        warnings: effective.warnings,
      },
    };
  }

  async function resetSettings(): Promise<ApiResponse> {
    await deps.reset();
    deps.invalidate();

    const effective = await deps.getEffective();

    return {
      status: 200,
      json: {
        ok: true,
        values: configToEnvStrings(effective.config),
        source: effective.source,
        updatedAt: effective.updatedAt,
        updatedBy: effective.updatedBy,
        warnings: effective.warnings,
      },
    };
  }

  return {
    getSettings,
    putSettings,
    resetSettings,
  };
}
