/**
 * Groq vision quality bake-off script
 * Tests the Groq vision model on sample photos with known criteria
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { GroqAdapter, DEFAULT_GROQ_VISION_MODEL } from "./ai/providers/groq.js";
import {
  buildVolumetricRequest,
  finalizeVolumetric,
  volumetricEstimateSchema,
} from "./flows/volumetric.js";
import {
  buildInventoryGroups,
  normaliseSameRoomAs,
} from "./flows/rooms.js";

// Silence console.debug and console.info
console.debug = () => {};
console.info = () => {};
const printErr = console.error.bind(console);

// Check GROQ_API_KEY
if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY not set. Cannot run Groq vision bake-off.");
  process.exit(1);
}

// Check test photos
const PHOTOS = ["test-room-photo.jpg", "test-kitchen.jpg", "test-bedroom.jpg"];
for (const photo of PHOTOS) {
  if (!existsSync(photo)) {
    console.error(`Missing test photo: ${photo}`);
    process.exit(1);
  }
}

// Initialize adapter
const adapter = new GroqAdapter({
  model: process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL,
  images: true,
  reasoning: { effort: "none", format: "hidden" },
  maxRetryAfterMs: 30000,
});

// Read photos
const sofa = readFileSync("test-room-photo.jpg").toString("base64");
const kitchen = readFileSync("test-kitchen.jpg").toString("base64");
const bedroom = readFileSync("test-bedroom.jpg").toString("base64");

// Fixed inventories
const INV_SOFA = buildInventoryGroups([
  {
    room_key: "living_room",
    room_qualifier: null,
    items: JSON.stringify([
      { name: "3-Seater Velvet Sofa", quantity: 1, alreadyCounted: false },
    ]),
  },
]);

const INV_BEDROOM = buildInventoryGroups([
  {
    room_key: "bedroom",
    room_qualifier: null,
    items: JSON.stringify(
      [
        { name: "King Bed Frame with Mattress", quantity: 1 },
        { name: "Bedside Chest / Dresser", quantity: 2 },
        { name: "End of Bed Wooden Bench", quantity: 1 },
        { name: "Large Bedroom Area Rug", quantity: 1 },
        { name: "Framed Wall Artwork", quantity: 1 },
      ].map((i) => ({ ...i, alreadyCounted: false }))
    ),
  },
]);

interface Case {
  id: string;
  photo: string;
  inventory: typeof INV_SOFA | typeof INV_BEDROOM | [];
  checks: Array<{ name: string; fn: (parsed: any, finalized?: any) => boolean }>;
}

const CASES: Case[] = [
  {
    id: "C1",
    photo: sofa,
    inventory: [],
    checks: [
      {
        name: "roomKey=living_room",
        fn: (parsed) => parsed.roomKey === "living_room",
      },
      {
        name: "sum_cuft_25-70",
        fn: (parsed) => {
          const sum = parsed.items.reduce(
            (acc: number, item: any) => acc + item.estimatedCubicFeet,
            0
          );
          return sum >= 25 && sum <= 70;
        },
      },
      {
        name: "sofa_or_couch_found",
        fn: (parsed) =>
          parsed.items.some((item: any) => /sofa|couch/i.test(item.name)),
      },
    ],
  },
  {
    id: "C2",
    photo: sofa,
    inventory: INV_SOFA,
    checks: [
      {
        name: "matchedExisting=true",
        fn: (_parsed, finalized) => finalized.room.matchedExisting === true,
      },
      {
        name: "newItemCount=0",
        fn: (_parsed, finalized) => finalized.totals.newItemCount === 0,
      },
      {
        name: "duplicateItemCount>=1",
        fn: (_parsed, finalized) => finalized.totals.duplicateItemCount >= 1,
      },
    ],
  },
  {
    id: "C3",
    photo: kitchen,
    inventory: [],
    checks: [
      {
        name: "roomKey=kitchen",
        fn: (parsed) => parsed.roomKey === "kitchen",
      },
      {
        name: "sum_cuft_60-200",
        fn: (parsed) => {
          const sum = parsed.items.reduce(
            (acc: number, item: any) => acc + item.estimatedCubicFeet,
            0
          );
          return sum >= 60 && sum <= 200;
        },
      },
      {
        name: "fridge_and_stove_found",
        fn: (parsed) => {
          const hasFridge = parsed.items.some((item: any) =>
            /refrigerator|fridge/i.test(item.name)
          );
          const hasStove = parsed.items.some((item: any) =>
            /range|stove|cooker|oven|hob/i.test(item.name)
          );
          return hasFridge && hasStove;
        },
      },
    ],
  },
  {
    id: "C4",
    photo: bedroom,
    inventory: [],
    checks: [
      {
        name: "roomKey=bedroom",
        fn: (parsed) => parsed.roomKey === "bedroom",
      },
      {
        name: "sum_cuft_70-250",
        fn: (parsed) => {
          const sum = parsed.items.reduce(
            (acc: number, item: any) => acc + item.estimatedCubicFeet,
            0
          );
          return sum >= 70 && sum <= 250;
        },
      },
      {
        name: "bed_found",
        fn: (parsed) => parsed.items.some((item: any) => /bed/i.test(item.name)),
      },
    ],
  },
  {
    id: "C5",
    photo: bedroom,
    inventory: INV_BEDROOM,
    checks: [
      {
        name: "matchedExisting=true",
        fn: (_parsed, finalized) => finalized.room.matchedExisting === true,
      },
      {
        name: "newItemCount<=1",
        fn: (_parsed, finalized) => finalized.totals.newItemCount <= 1,
      },
      {
        name: "duplicateItemCount>=3",
        fn: (_parsed, finalized) => finalized.totals.duplicateItemCount >= 3,
      },
    ],
  },
  {
    id: "C6",
    photo: sofa,
    inventory: INV_BEDROOM,
    checks: [
      {
        name: "sameRoomAs=null",
        fn: (parsed) => normaliseSameRoomAs(parsed.sameRoomAs) === null,
      },
      {
        name: "no_alreadyCounted=true",
        fn: (parsed) =>
          parsed.items.every((item: any) => item.alreadyCounted !== true),
      },
    ],
  },
];

interface RunResult {
  schemaValid: boolean;
  parsed: any;
  finalized?: any;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  checks: Record<string, boolean>;
  error?: string;
}

async function runCase(
  caseSpec: Case
): Promise<RunResult> {
  const request = buildVolumetricRequest(
    { type: "image", mimeType: "image/jpeg", base64Data: caseSpec.photo },
    caseSpec.inventory
  );

  const startTime = Date.now();
  try {
    const res = await adapter.call(request);
    const latencyMs = Date.now() - startTime;

    const tokensIn = res.usage?.inputTokens ?? 0;
    const tokensOut = res.usage?.outputTokens ?? 0;

    const safeParse = volumetricEstimateSchema.safeParse(res.raw);
    if (!safeParse.success) {
      return {
        schemaValid: false,
        parsed: res.raw,
        latencyMs,
        tokensIn,
        tokensOut,
        checks: Object.fromEntries(
          caseSpec.checks.map((c) => [c.name, false])
        ),
        error: "Schema validation failed",
      };
    }

    const parsed = safeParse.data;
    const finalized = finalizeVolumetric(parsed, caseSpec.inventory);

    const checksResult: Record<string, boolean> = {};
    for (const check of caseSpec.checks) {
      try {
        checksResult[check.name] = check.fn(parsed, finalized);
      } catch {
        checksResult[check.name] = false;
      }
    }

    return {
      schemaValid: true,
      parsed,
      finalized,
      latencyMs,
      tokensIn,
      tokensOut,
      checks: checksResult,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      schemaValid: false,
      parsed: null,
      latencyMs,
      tokensIn: 0,
      tokensOut: 0,
      checks: Object.fromEntries(caseSpec.checks.map((c) => [c.name, false])),
      error: String(error instanceof Error ? error.message : error).slice(0, 120),
    };
  }
}

async function main() {
  console.log(`Groq vision bake-off, model ${process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL}`);

  // Model access check
  try {
    const modelCheckRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });

    if (!modelCheckRes.ok) {
      console.error(`Groq model list request failed: HTTP ${modelCheckRes.status}`);
      const bodyText = await modelCheckRes.text();
      console.error(bodyText.slice(0, 200));
      process.exit(1);
    }

    const modelData = await modelCheckRes.json() as { data: Array<{ id: string }> };
    const modelIds = modelData.data.map((m) => m.id);
    const targetModel = process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL;
    const isPresent = modelIds.includes(targetModel);

    if (isPresent) {
      console.log(`Groq model access check: ${targetModel} PRESENT (${modelIds.length} models visible)`);
    } else {
      console.log(`Groq model access check: ${targetModel} MISSING (${modelIds.length} models visible)`);
      const matchingIds = modelIds.filter((id) => /qwen|vision|llama-4|scout|maverick/i.test(id));
      if (matchingIds.length > 0) {
        console.log(matchingIds.join(", "));
      } else {
        console.log("none match");
      }
      process.exit(1);
    }
  } catch (error) {
    console.error(`Groq model access check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  console.warn = () => {};
  console.error = () => {};

  console.log("Free-tier pacing: 60 s between calls, 18 calls, about 19 minutes. Do not run the server at the same time.");

  const allResults: Array<{ caseId: string; result: RunResult }> = [];

  for (let runIndex = 0; runIndex < 3; runIndex++) {
    for (const caseSpec of CASES) {
      if (runIndex > 0 || CASES.indexOf(caseSpec) > 0) {
        // 60 second pause between calls (except the very first)
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }

      const result = await runCase(caseSpec);
      allResults.push({ caseId: caseSpec.id, result });

      // Print compact line
      const schemaStr = result.schemaValid ? "ok" : "invalid";
      const roomKey = result.parsed?.roomKey || "?";
      const matched = result.finalized?.room.matchedExisting ?? false;
      const newItems = result.finalized?.totals.newItemCount ?? 0;
      const dupItems = result.finalized?.totals.duplicateItemCount ?? 0;

      const itemsStr = result.parsed?.items
        ? result.parsed.items
            .slice(0, 8)
            .map(
              (item: any) =>
                `${item.name.slice(0, 28)} x${item.quantity} ${item.estimatedCubicFeet}cuft${item.alreadyCounted ? " dup" : ""}`
            )
            .join(", ")
        : "";

      const allChecksPassed = Object.values(result.checks).every((v) => v);
      const failedChecks = Object.entries(result.checks)
        .filter(([_, v]) => !v)
        .map(([k, _]) => k);
      const checksStr = allChecksPassed
        ? "PASS"
        : `FAIL(${failedChecks.join(",")})`;

      if (result.error) {
        console.log(
          `[${caseSpec.id} run ${runIndex + 1}] ERROR ${result.error} latency=${result.latencyMs}ms checks=${checksStr}`
        );
      } else {
        console.log(
          `[${caseSpec.id} run ${runIndex + 1}] schema=${schemaStr} room=${roomKey} matched=${matched} new=${newItems} dup=${dupItems} items=[${itemsStr}] latency=${result.latencyMs}ms tokens=${result.tokensIn}/${result.tokensOut} checks=${checksStr}`
        );
      }
    }
  }

  // Summary
  console.log("");

  // Per-case pass rate
  for (const caseSpec of CASES) {
    const caseResults = allResults.filter((r) => r.caseId === caseSpec.id);
    const passed = caseResults.filter((r) =>
      Object.values(r.result.checks).every((v) => v)
    ).length;
    console.log(`${caseSpec.id}: ${passed}/3 passed`);
  }

  console.log("");

  // Gate checks
  const schemaValidCount = allResults.filter((r) => r.result.schemaValid).length;
  const schemaGate = schemaValidCount === 18;
  console.log(
    `schema valid: ${schemaValidCount}/18 (need 18/18)${schemaGate ? "" : " FAIL"}`
  );

  const roomCases = ["C1", "C3", "C4"];
  const roomResults = allResults.filter((r) => roomCases.includes(r.caseId));
  const roomCorrect = roomResults.filter((r) => {
    const check = Object.entries(r.result.checks).find(([k, _]) =>
      k.startsWith("roomKey=")
    );
    return check && check[1];
  }).length;
  const roomGate = roomCorrect >= 8;
  console.log(
    `room type correct (C1,C3,C4): ${roomCorrect}/9 (need >= 8)${roomGate ? "" : " FAIL"}`
  );

  const dedupeCases = ["C2", "C5"];
  const dedupeResults = allResults.filter((r) => dedupeCases.includes(r.caseId));
  const dedupePositive = dedupeResults.filter((r) =>
    Object.values(r.result.checks).every((v) => v)
  ).length;
  const dedupePositiveGate = dedupePositive >= 5;
  console.log(
    `dedupe positive (C2,C5): ${dedupePositive}/6 (need >= 5)${dedupePositiveGate ? "" : " FAIL"}`
  );

  const dedupeNegCases = ["C6"];
  const dedupeNegResults = allResults.filter((r) => dedupeNegCases.includes(r.caseId));
  const dedupeNegative = dedupeNegResults.filter((r) =>
    Object.values(r.result.checks).every((v) => v)
  ).length;
  const dedupeNegativeGate = dedupeNegative === 3;
  console.log(
    `dedupe negative (C6): ${dedupeNegative}/3 (need 3/3)${dedupeNegativeGate ? "" : " FAIL"}`
  );

  const keyItemCases = ["C1", "C3", "C4"];
  const keyItemResults = allResults.filter((r) => keyItemCases.includes(r.caseId));
  const keyItemsFound = keyItemResults.filter((r) => {
    const caseSpec = CASES.find((c) => c.id === r.caseId)!;
    const itemCheck = caseSpec.checks.find((c) => c.name.includes("_found"));
    if (!itemCheck) return false;
    return r.result.checks[itemCheck.name];
  }).length;
  const keyItemsGate = keyItemsFound >= 8;
  console.log(
    `key items found (C1,C3,C4): ${keyItemsFound}/9 (need >= 8)${keyItemsGate ? "" : " FAIL"}`
  );

  const volumeCases = ["C1", "C3", "C4"];
  const volumeResults = allResults.filter((r) => volumeCases.includes(r.caseId));
  const volumeInBand = volumeResults.filter((r) => {
    const caseSpec = CASES.find((c) => c.id === r.caseId)!;
    const volCheck = caseSpec.checks.find((c) => c.name.includes("sum_cuft"));
    if (!volCheck) return false;
    return r.result.checks[volCheck.name];
  }).length;
  const volumeGate = volumeInBand >= 8;
  console.log(
    `volume in band (C1,C3,C4): ${volumeInBand}/9 (need >= 8)${volumeGate ? "" : " FAIL"}`
  );

  // Median latency and total tokens
  const latencies = allResults
    .filter((r) => r.result.latencyMs > 0)
    .map((r) => r.result.latencyMs)
    .sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length / 2)] || 0;
  const totalTokensIn = allResults.reduce((sum, r) => sum + r.result.tokensIn, 0);
  const totalTokensOut = allResults.reduce((sum, r) => sum + r.result.tokensOut, 0);

  console.log(`median latency: ${medianLatency}ms, total tokens in/out: ${totalTokensIn}/${totalTokensOut}`);
  console.log("Gemini calls made: 0");

  // Final gate
  const allGates = [
    schemaGate,
    roomGate,
    dedupePositiveGate,
    dedupeNegativeGate,
    keyItemsGate,
    volumeGate,
  ];
  const allPassed = allGates.every((g) => g);

  if (allPassed) {
    console.log("GATE: PASS");
  } else {
    const failedGateNames: string[] = [];
    if (!schemaGate) failedGateNames.push("schema valid");
    if (!roomGate) failedGateNames.push("room type correct");
    if (!dedupePositiveGate) failedGateNames.push("dedupe positive");
    if (!dedupeNegativeGate) failedGateNames.push("dedupe negative");
    if (!keyItemsGate) failedGateNames.push("key items found");
    if (!volumeGate) failedGateNames.push("volume in band");

    console.log(`GATE: FAIL (${failedGateNames.join(", ")})`);
  }
}

main().catch((error) => {
  printErr("Fatal error:", error);
  process.exit(1);
});
