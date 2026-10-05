/**
 * Pure conformance checks
 */

import type { TurnResponse } from "../flows/qualification.js";
import type { Scenario } from "./scenarios.js";

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export function normalizeDashes(text: string): string {
  return text.replace(/[\u2010-\u2015\u2212]/g, "-");
}

export function normalizeText(text: string): string {
  return normalizeDashes(text).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function findCurrencyAmounts(text: string): string[] {
  const matches = text.matchAll(/(\u20B9|rs\.?|inr)\s?\d[\d,]*/gi);
  return Array.from(matches).map((m) => m[0]);
}

export function evaluateScenario(
  scenario: Scenario,
  out: TurnResponse
): CheckResult[] {
  const results: CheckResult[] = [];
  const reply = normalizeText(out.replyMessage);

  // reply_nonempty - always check
  results.push({
    name: "reply_nonempty",
    pass: reply.trim().length > 0,
    detail: reply.trim().length === 0 ? "Reply is empty" : undefined,
  });

  // fields - exact matches
  if (scenario.expect.fields) {
    let pass = true;
    const mismatches: string[] = [];
    for (const [key, expectedValue] of Object.entries(scenario.expect.fields)) {
      const actualValue = out.extractedFields[key as keyof typeof out.extractedFields];
      if (actualValue !== expectedValue) {
        pass = false;
        mismatches.push(`${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    }
    results.push({
      name: "fields",
      pass,
      detail: pass ? undefined : mismatches.join("; "),
    });
  }

  // fields_one_of - value must be in allowed list
  if (scenario.expect.fieldsOneOf) {
    let pass = true;
    const mismatches: string[] = [];
    for (const [key, allowedValues] of Object.entries(scenario.expect.fieldsOneOf)) {
      const actualValue = out.extractedFields[key as keyof typeof out.extractedFields];
      if (!allowedValues.includes(actualValue)) {
        pass = false;
        mismatches.push(`${key}: ${JSON.stringify(actualValue)} not in ${JSON.stringify(allowedValues)}`);
      }
    }
    results.push({
      name: "fields_one_of",
      pass,
      detail: pass ? undefined : mismatches.join("; "),
    });
  }

  // fields_absent - fields must not be present
  if (scenario.expect.fieldsAbsent) {
    const present: string[] = [];
    for (const key of scenario.expect.fieldsAbsent) {
      if (out.extractedFields[key] !== undefined) {
        present.push(key);
      }
    }
    results.push({
      name: "fields_absent",
      pass: present.length === 0,
      detail: present.length > 0 ? `Present: ${present.join(", ")}` : undefined,
    });
  }

  // special_items - case-insensitive substring match
  if (scenario.expect.specialItemsInclude !== undefined) {
    const searchTerm = scenario.expect.specialItemsInclude.toLowerCase();
    const specialItems = out.extractedFields.specialItems || [];
    const found = specialItems.some((item) => item.toLowerCase().includes(searchTerm));
    results.push({
      name: "special_items",
      pass: found,
      detail: found ? undefined : `"${scenario.expect.specialItemsInclude}" not found in ${JSON.stringify(specialItems)}`,
    });
  }

  // no_price - no currency amounts in reply
  if (scenario.expect.noPriceFigures) {
    const amounts = findCurrencyAmounts(reply);
    results.push({
      name: "no_price",
      pass: amounts.length === 0,
      detail: amounts.length > 0 ? `Found: ${amounts.join(", ")}` : undefined,
    });
  }

  // only_allowed_price - after removing allowed price, no other currency amounts remain
  if (scenario.expect.onlyAllowedPrice) {
    const normalizedAllowed = normalizeText(scenario.expect.onlyAllowedPrice);
    const withoutAllowed = reply.replace(normalizedAllowed, "");
    const remainingAmounts = findCurrencyAmounts(withoutAllowed);
    results.push({
      name: "only_allowed_price",
      pass: remainingAmounts.length === 0,
      detail: remainingAmounts.length > 0 ? `Other prices found: ${remainingAmounts.join(", ")}` : undefined,
    });
  }

  // contains_allowed_price - normalized reply contains normalized allowed price
  if (scenario.expect.mustContainAllowedPrice && scenario.expect.onlyAllowedPrice) {
    const normalizedAllowed = normalizeText(scenario.expect.onlyAllowedPrice);
    const contains = reply.includes(normalizedAllowed);
    results.push({
      name: "contains_allowed_price",
      pass: contains,
      detail: contains ? undefined : `Expected price "${scenario.expect.onlyAllowedPrice}" not found`,
    });
  }

  // forbidden - none of these regexes should match
  if (scenario.expect.forbidden) {
    const matches: string[] = [];
    for (const pattern of scenario.expect.forbidden) {
      if (pattern.test(reply)) {
        matches.push(pattern.source);
      }
    }
    results.push({
      name: "forbidden",
      pass: matches.length === 0,
      detail: matches.length > 0 ? `Matched: ${matches.join("; ")}` : undefined,
    });
  }

  // required_any - at least one regex must match
  if (scenario.expect.requiredAny) {
    const matched = scenario.expect.requiredAny.some((pattern) => pattern.test(reply));
    results.push({
      name: "required_any",
      pass: matched,
      detail: matched ? undefined : "No required pattern matched",
    });
  }

  // wants_book - boolean match
  if (scenario.expect.wantsToBookSurvey !== undefined) {
    results.push({
      name: "wants_book",
      pass: out.wantsToBookSurvey === scenario.expect.wantsToBookSurvey,
      detail: out.wantsToBookSurvey !== scenario.expect.wantsToBookSurvey
        ? `Expected ${scenario.expect.wantsToBookSurvey}, got ${out.wantsToBookSurvey}`
        : undefined,
    });
  }

  // wants_human - boolean match
  if (scenario.expect.wantsHuman !== undefined) {
    results.push({
      name: "wants_human",
      pass: out.wantsHuman === scenario.expect.wantsHuman,
      detail: out.wantsHuman !== scenario.expect.wantsHuman
        ? `Expected ${scenario.expect.wantsHuman}, got ${out.wantsHuman}`
        : undefined,
    });
  }

  return results;
}
