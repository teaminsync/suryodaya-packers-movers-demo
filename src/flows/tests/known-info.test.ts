/**
 * Tests for buildKnownInfo
 */

import { buildKnownInfo } from "../known-info.js";

describe("buildKnownInfo", () => {
  it("includes all five string fields when set", () => {
    const lead = {
      move_type: "local",
      origin: "Mumbai",
      destination: "Pune",
      urgency: "this_week",
      estimated_volume: "2bhk",
      has_special_items: false,
      special_items: null,
      requires_packing: false,
    };

    const result = buildKnownInfo(lead);

    expect(result).toEqual({
      moveType: "local",
      origin: "Mumbai",
      destination: "Pune",
      urgency: "this_week",
      estimatedVolume: "2bhk",
    });
  });

  it("omits null empty and whitespace-only string fields", () => {
    const lead = {
      move_type: null,
      origin: "",
      destination: "   ",
      urgency: "immediate",
      estimated_volume: "1bhk",
      has_special_items: false,
      special_items: null,
      requires_packing: false,
    };

    const result = buildKnownInfo(lead);

    expect(result).toEqual({
      urgency: "immediate",
      estimatedVolume: "1bhk",
    });
    expect(result).not.toHaveProperty("moveType");
    expect(result).not.toHaveProperty("origin");
    expect(result).not.toHaveProperty("destination");
  });

  it("omits hasSpecialItems specialItems and requiresPacking when all are false or null", () => {
    const lead = {
      move_type: "intercity",
      origin: "Delhi",
      destination: "Bangalore",
      urgency: "flexible",
      estimated_volume: "3bhk",
      has_special_items: false,
      special_items: null,
      requires_packing: false,
    };

    const result = buildKnownInfo(lead);

    expect(result).not.toHaveProperty("hasSpecialItems");
    expect(result).not.toHaveProperty("specialItems");
    expect(result).not.toHaveProperty("requiresPacking");
  });

  it("includes hasSpecialItems specialItems and requiresPacking when true", () => {
    const lead = {
      move_type: "local",
      origin: "Hyderabad",
      destination: "Secunderabad",
      urgency: "this_month",
      estimated_volume: "1bhk",
      has_special_items: true,
      special_items: '["piano"]',
      requires_packing: true,
    };

    const result = buildKnownInfo(lead);

    expect(result.hasSpecialItems).toBe(true);
    expect(result.specialItems).toEqual(["piano"]);
    expect(result.requiresPacking).toBe(true);
  });

  it("handles special items logic with has_special_items false and items present", () => {
    const lead1 = {
      move_type: null,
      origin: null,
      destination: null,
      urgency: null,
      estimated_volume: null,
      has_special_items: false,
      special_items: '["safe"]',
      requires_packing: false,
    };

    const result1 = buildKnownInfo(lead1);
    expect(result1.hasSpecialItems).toBe(true);
    expect(result1.specialItems).toEqual(["safe"]);

    const lead2 = {
      move_type: null,
      origin: null,
      destination: null,
      urgency: null,
      estimated_volume: null,
      has_special_items: false,
      special_items: "not json",
      requires_packing: false,
    };

    const result2 = buildKnownInfo(lead2);
    expect(result2).not.toHaveProperty("hasSpecialItems");
    expect(result2).not.toHaveProperty("specialItems");

    const lead3 = {
      move_type: null,
      origin: null,
      destination: null,
      urgency: null,
      estimated_volume: null,
      has_special_items: true,
      special_items: "not json",
      requires_packing: false,
    };

    const result3 = buildKnownInfo(lead3);
    expect(result3.hasSpecialItems).toBe(true);
    expect(result3).not.toHaveProperty("specialItems");
  });

  it("cleans special items array and preserves input immutability", () => {
    const inputObj = {
      move_type: null,
      origin: null,
      destination: null,
      urgency: null,
      estimated_volume: null,
      has_special_items: false,
      special_items: ["piano", "  ", 5, null, "table"] as unknown as string[],
      requires_packing: false,
    };

    const beforeJson = JSON.stringify(inputObj);
    const result1 = buildKnownInfo(inputObj);
    const afterJson = JSON.stringify(inputObj);

    expect(result1.specialItems).toEqual(["piano", "table"]);
    expect(afterJson).toBe(beforeJson);

    const result2 = buildKnownInfo(inputObj);
    expect(result2).toEqual(result1);
    expect(result2).not.toBe(result1);
  });
});
