import { describe, it, expect } from "@jest/globals";
import { createSurveySettingsApi } from "../settings-api.js";
import { configToEnvStrings, type EffectiveSurveySettings } from "../settings.js";
import { DEFAULT_SURVEY_CONFIG } from "../config.js";

describe("Survey settings API", () => {
  const defaultEffective: EffectiveSurveySettings = {
    config: DEFAULT_SURVEY_CONFIG,
    source: "env",
    warnings: [],
    updatedAt: null,
    updatedBy: null,
  };

  it("getSettings returns correct shape", async () => {
    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {},
      reset: async () => {},
      invalidate: () => {},
    });

    const response = await api.getSettings();

    expect(response.status).toBe(200);
    expect(response.json.ok).toBe(true);
    expect(response.json.values).toEqual(configToEnvStrings(DEFAULT_SURVEY_CONFIG));
    expect(response.json.source).toBe("env");
    expect(response.json.updatedAt).toBeNull();
    expect(response.json.updatedBy).toBeNull();
    expect(response.json.warnings).toEqual([]);
  });

  it("putSettings valid saves canonical values with staff sanitised", async () => {
    let savedValues: any = null;
    let savedBy: any = null;

    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async (v, u) => {
        savedValues = v;
        savedBy = u;
      },
      reset: async () => {},
      invalidate: () => {},
    });

    const defaultValues = configToEnvStrings(DEFAULT_SURVEY_CONFIG);
    const body = {
      values: defaultValues,
      staff: "  John   Doe  ",
    };

    const response = await api.putSettings(body);

    expect(response.status).toBe(200);
    expect(response.json.ok).toBe(true);
    expect(savedValues).toEqual(defaultValues);
    expect(savedBy).toBe("John Doe");
  });

  it("putSettings invalidates after saving", async () => {
    let invalidateCalled = false;

    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {},
      reset: async () => {},
      invalidate: () => {
        invalidateCalled = true;
      },
    });

    const body = {
      values: configToEnvStrings(DEFAULT_SURVEY_CONFIG),
    };

    await api.putSettings(body);

    expect(invalidateCalled).toBe(true);
  });

  it("putSettings returns 200 after save", async () => {
    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {},
      reset: async () => {},
      invalidate: () => {},
    });

    const body = {
      values: configToEnvStrings(DEFAULT_SURVEY_CONFIG),
    };

    const response = await api.putSettings(body);

    expect(response.status).toBe(200);
    expect(response.json.ok).toBe(true);
  });

  it("putSettings invalid returns 400 with errors and save not called", async () => {
    let saveCalled = false;

    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {
        saveCalled = true;
      },
      reset: async () => {},
      invalidate: () => {},
    });

    const body = {
      values: {
        SURVEY_DURATION_MINUTES: "5", // below min 15
      },
    };

    const response = await api.putSettings(body);

    expect(response.status).toBe(400);
    expect(response.json.ok).toBe(false);
    expect(response.json.code).toBe("invalid");
    expect(Array.isArray(response.json.errors)).toBe(true);
    expect(saveCalled).toBe(false);
  });

  it("putSettings with non-object body returns 400", async () => {
    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {},
      reset: async () => {},
      invalidate: () => {},
    });

    const response = await api.putSettings("not an object");

    expect(response.status).toBe(400);
    expect(response.json.ok).toBe(false);
    expect(response.json.code).toBe("invalid");
  });

  it("resetSettings calls reset then invalidate", async () => {
    let resetCalled = false;
    let invalidateCalled = false;
    let invalidateAfterReset = false;

    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {},
      reset: async () => {
        resetCalled = true;
        invalidateAfterReset = !invalidateCalled;
      },
      invalidate: () => {
        invalidateCalled = true;
      },
    });

    const response = await api.resetSettings();

    expect(response.status).toBe(200);
    expect(response.json.ok).toBe(true);
    expect(resetCalled).toBe(true);
    expect(invalidateCalled).toBe(true);
    expect(invalidateAfterReset).toBe(true);
  });

  it("save throwing propagates", async () => {
    const api = createSurveySettingsApi({
      getEffective: async () => defaultEffective,
      save: async () => {
        throw new Error("DB error");
      },
      reset: async () => {},
      invalidate: () => {},
    });

    const body = {
      values: configToEnvStrings(DEFAULT_SURVEY_CONFIG),
    };

    await expect(api.putSettings(body)).rejects.toThrow("DB error");
  });
});
