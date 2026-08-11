/**
 * REAL API TEST - Section 6.2
 * Tests Claude in PRODUCTION mode with real API calls
 *
 * REQUIREMENTS:
 * - Run with REAL valid ANTHROPIC_API_KEY set
 * - Confirm startup log shows "AI mode: PRODUCTION"
 * - Test both text-only and vision requests
 * - Paste back: startup log, structured call logs, raw responses, providerUsed confirmation
 */

import "dotenv/config";
import { z } from "zod";
import { aiRouter } from "../router.js";
import { AIRequest } from "../types.js";

// Only run if explicitly requested via test:live command
const isLiveTest = process.env.RUN_LIVE_TESTS === "true";
const describeIfLive = isLiveTest ? describe : describe.skip;

describeIfLive("Live Claude Tests (PRODUCTION mode)", () => {
  beforeAll(async () => {
    // Ensure ANTHROPIC_API_KEY is set
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY must be set for this test suite (Section 6.2)"
      );
    }

    await aiRouter.initialize();

    const config = aiRouter.getConfig();
    console.log("\n=== ROUTER CONFIG ===");
    console.log("Mode:", config?.mode);
    console.log("Primary:", config?.primary.name);
    console.log("Fallback:", config?.fallback?.name || "none");
    console.log("====================\n");

    if (config?.mode !== "PRODUCTION") {
      throw new Error(
        `Expected PRODUCTION mode, got ${config?.mode}. Check ANTHROPIC_API_KEY validity.`
      );
    }
  });

  it("should handle text-only request via Claude", async () => {
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
      taskName: "live_test_claude_text_only",
    };

    console.log("\n=== TEXT-ONLY REQUEST (CLAUDE) ===");
    const response = await aiRouter.call(request);

    console.log("Response data:", JSON.stringify(response.data, null, 2));
    console.log("Provider used:", response.providerUsed);
    console.log("Model used:", response.modelUsed);
    console.log("Was failover:", response.wasFailover);
    console.log("Latency (ms):", response.latencyMs);
    console.log("Usage:", response.rawUsage);
    console.log("===================================\n");

    expect(response.providerUsed).toBe("claude");
    expect(response.wasFailover).toBe(false);
    expect(response.data).toHaveProperty("moveType");
    expect(response.data).toHaveProperty("urgency");
    expect(["low", "medium", "high"]).toContain(response.data.urgency);
  });

  it("should handle vision request via Claude", async () => {
    const schema = z.object({
      description: z.string(),
      itemsVisible: z.array(z.string()),
      complexity: z.enum(["simple", "moderate", "complex"]),
    });

    // Simple 1x1 red pixel PNG (base64)
    const testImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

    const request: AIRequest<typeof schema> = {
      systemPrompt:
        "You are an assistant that analyzes room photos for moving estimates. Describe what you see and estimate complexity.",
      userPrompt:
        "Analyze this room image and provide a structured description. If it's a test image, describe it as such.",
      images: [
        {
          mimeType: "image/png",
          base64Data: testImageBase64,
        },
      ],
      responseSchema: schema,
      taskName: "live_test_claude_vision",
    };

    console.log("\n=== VISION REQUEST (CLAUDE) ===");
    const response = await aiRouter.call(request);

    console.log("Response data:", JSON.stringify(response.data, null, 2));
    console.log("Provider used:", response.providerUsed);
    console.log("Model used:", response.modelUsed);
    console.log("Was failover:", response.wasFailover);
    console.log("Latency (ms):", response.latencyMs);
    console.log("Usage:", response.rawUsage);
    console.log("================================\n");

    expect(response.providerUsed).toBe("claude");
    expect(response.wasFailover).toBe(false);
    expect(response.data).toHaveProperty("description");
    expect(response.data).toHaveProperty("itemsVisible");
    expect(response.data).toHaveProperty("complexity");
    expect(["simple", "moderate", "complex"]).toContain(response.data.complexity);
  });
});
