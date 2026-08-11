/**
 * REAL API TEST - Section 6.3
 * Tests actual failover mechanism with deliberate Claude failure
 *
 * REQUIREMENTS:
 * - Run with REAL valid ANTHROPIC_API_KEY set (establishes PRODUCTION mode)
 * - Deliberately break Claude (corrupt model name or use invalid key temporarily)
 * - Confirm router logs Claude failure, then automatically calls Gemini
 * - Verify wasFailover: true and request still succeeds
 * - Paste back: full log sequence showing failure → automatic recovery
 *
 * IMPORTANT: This test requires manual environment manipulation:
 * 1. Start with valid ANTHROPIC_API_KEY to initialize PRODUCTION mode
 * 2. Temporarily corrupt CLAUDE_MODEL to trigger provider failure
 * 3. OR temporarily swap in invalid ANTHROPIC_API_KEY after initialization
 */

import "dotenv/config";
import { z } from "zod";
import { aiRouter } from "../router.js";
import { AIRequest } from "../types.js";

// Only run if explicitly requested via test:live command
const isLiveTest = process.env.RUN_LIVE_TESTS === "true";
const describeIfLive = isLiveTest ? describe : describe.skip;

describeIfLive("Forced Failover Tests (PRODUCTION mode)", () => {
  beforeAll(async () => {
    // Ensure ANTHROPIC_API_KEY is set
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY must be set for this test suite (Section 6.3)"
      );
    }

    // Initialize in PRODUCTION mode
    await aiRouter.initialize();

    const config = aiRouter.getConfig();
    console.log("\n=== INITIAL ROUTER CONFIG ===");
    console.log("Mode:", config?.mode);
    console.log("Primary:", config?.primary.name);
    console.log("Fallback:", config?.fallback?.name || "none");
    console.log("=============================\n");

    if (config?.mode !== "PRODUCTION") {
      throw new Error(
        `Expected PRODUCTION mode for failover test, got ${config?.mode}`
      );
    }
  });

  it("should failover from Claude to Gemini when Claude model is invalid", async () => {
    // Corrupt the Claude model to force a failure
    const originalModel = process.env.CLAUDE_MODEL;
    process.env.CLAUDE_MODEL = "nonexistent-model-404";

    console.log(
      "\n⚠️  Corrupted CLAUDE_MODEL to:",
      process.env.CLAUDE_MODEL,
      "\n"
    );

    try {
      const schema = z.object({
        moveType: z.string(),
        urgency: z.enum(["low", "medium", "high"]),
      });

      const request: AIRequest<typeof schema> = {
        systemPrompt:
          "You are an assistant that classifies moving enquiries. Extract the move type and urgency level.",
        userPrompt:
          "Need to move a 2BHK from Pune to Bengaluru next week, have a piano",
        responseSchema: schema,
        taskName: "live_test_forced_failover",
      };

      console.log("\n=== FORCED FAILOVER TEST ===");
      console.log("Expecting: Claude fails → automatic Gemini fallback\n");

      const response = await aiRouter.call(request);

      console.log("\n✅ REQUEST SUCCEEDED VIA FAILOVER");
      console.log("Response data:", JSON.stringify(response.data, null, 2));
      console.log("Provider used:", response.providerUsed);
      console.log("Model used:", response.modelUsed);
      console.log("Was failover:", response.wasFailover);
      console.log("Latency (ms):", response.latencyMs);
      console.log("Usage:", response.rawUsage);
      console.log("============================\n");

      // Verify failover occurred
      expect(response.providerUsed).toBe("gemini");
      expect(response.wasFailover).toBe(true);
      expect(response.data).toHaveProperty("moveType");
      expect(response.data).toHaveProperty("urgency");
      expect(["low", "medium", "high"]).toContain(response.data.urgency);
    } finally {
      // Restore original model
      if (originalModel) {
        process.env.CLAUDE_MODEL = originalModel;
      } else {
        delete process.env.CLAUDE_MODEL;
      }
      console.log("✓ Restored original CLAUDE_MODEL\n");
    }
  });

  // Optional: Schema validation failure path
  // This is harder to construct cleanly - left as documented gap if not implemented
  it.skip("should failover when Claude returns invalid schema (optional)", async () => {
    console.log(
      "\n⚠️  Schema validation failover test not implemented - documented as known gap\n"
    );
  });
});
