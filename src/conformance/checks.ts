/**
 * Pure conformance checks
 */

import type { TurnResponse } from "../flows/qualification.js";
import type { Scenario } from "./scenarios.js";
import { INCLUSION } from "./scenarios.js";

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

export function extractAmounts(text: string): number[] {
  const normalized = normalizeText(text);
  const matches = normalized.matchAll(/\d{1,3}(?:,\d{3})+|\d{4,}/g);
  const amounts: number[] = [];
  
  for (const match of matches) {
    const numStr = match[0].replace(/,/g, "");
    const num = parseInt(numStr, 10);
    
    // Drop plain 4-digit integers from 1900 to 2100 that had no comma (likely years)
    if (numStr.length === 4 && !match[0].includes(",") && num >= 1900 && num <= 2100) {
      continue;
    }
    
    amounts.push(num);
  }
  
  return amounts;
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
    const textAmounts = findCurrencyAmounts(reply);
    const numericAmounts = extractAmounts(reply);
    const pass = textAmounts.length === 0 && numericAmounts.length === 0;
    results.push({
      name: "no_price",
      pass,
      detail: pass ? undefined : `Found currency: ${textAmounts.join(", ")}; numbers: ${numericAmounts.join(", ")}`,
    });
  }

  // only_allowed_price - every number in reply must be in allowed price
  if (scenario.expect.onlyAllowedPrice) {
    const allowedAmounts = extractAmounts(scenario.expect.onlyAllowedPrice);
    const replyAmounts = extractAmounts(reply);
    const disallowed = replyAmounts.filter(amt => !allowedAmounts.includes(amt));
    results.push({
      name: "only_allowed_price",
      pass: disallowed.length === 0,
      detail: disallowed.length > 0 ? `Disallowed amounts: ${disallowed.join(", ")}` : undefined,
    });
  }

  // contains_allowed_price - every number in allowed price must appear in reply
  if (scenario.expect.mustContainAllowedPrice && scenario.expect.onlyAllowedPrice) {
    const allowedAmounts = extractAmounts(scenario.expect.onlyAllowedPrice);
    const replyAmounts = extractAmounts(reply);
    const missing = allowedAmounts.filter(amt => !replyAmounts.includes(amt));
    results.push({
      name: "contains_allowed_price",
      pass: missing.length === 0,
      detail: missing.length > 0 ? `Missing amounts: ${missing.join(", ")}` : undefined,
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

  // no_invented_denial - none of the inventedDenial patterns should match
  if (scenario.expect.inventedDenial) {
    const matches: string[] = [];
    for (const pattern of scenario.expect.inventedDenial) {
      if (pattern.test(reply)) {
        matches.push(pattern.source);
      }
    }
    results.push({
      name: "no_invented_denial",
      pass: matches.length === 0,
      detail: matches.length > 0 ? `Matched: ${matches.join("; ")}` : undefined,
    });
  }

  // no_inclusion_claim - INCLUSION pattern must not match
  if (scenario.expect.noInclusionClaims) {
    const matches = INCLUSION.test(reply);
    results.push({
      name: "no_inclusion_claim",
      pass: !matches,
      detail: matches ? `Matched: ${INCLUSION.source}` : undefined,
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
