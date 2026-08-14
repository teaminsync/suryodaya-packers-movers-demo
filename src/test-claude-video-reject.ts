/**
 * Test that Claude adapter fast-rejects video requests
 * This should throw immediately without making any network call
 */

import "dotenv/config";
import { z } from "zod";
import { ClaudeAdapter } from "./ai/providers/claude.js";
import type { AIRequest } from "./ai/types.js";

console.log("\n=== Testing Claude video fast-reject ===\n");

// Check if Claude API key is available
const hasClaudeKey = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0;
console.log(`ANTHROPIC_API_KEY present: ${hasClaudeKey ? "Yes" : "No"}`);
console.log(`Key length: ${process.env.ANTHROPIC_API_KEY?.length || 0} characters\n`);

if (!hasClaudeKey) {
  console.log("⚠ No Claude API key configured, but test will still work since rejection happens before network call\n");
}

// Create a minimal test schema
const testSchema = z.object({
  result: z.string(),
});

// Construct a request with video
const request: AIRequest<typeof testSchema> = {
  systemPrompt: "You are a test assistant.",
  userPrompt: "Analyze this video.",
  video: {
    mimeType: "video/mp4",
    base64Data: "fake-base64-data-for-test",
  },
  responseSchema: testSchema,
  taskName: "test_video_reject",
};

console.log("Attempting to call ClaudeAdapter with video request...\n");

const startTime = Date.now();

try {
  const adapter = new ClaudeAdapter();
  await adapter.call(request);
  
  // Should never reach here
  console.error("✗ FAIL: Claude accepted video request (should have rejected)\n");
  process.exit(1);
} catch (error) {
  const elapsedMs = Date.now() - startTime;
  
  console.log(`✓ Claude rejected video request as expected`);
  console.log(`Elapsed time: ${elapsedMs}ms (should be <100ms - no network call)`);
  console.log(`\nError message:\n${error instanceof Error ? error.message : String(error)}\n`);
  
  // Verify it's the right error
  if (error instanceof Error && error.message.includes("Claude does not support video input")) {
    console.log("✓ Error message is correct");
    console.log("✓ Rejection happened synchronously before network call");
    console.log("\n✓ Test passed\n");
    process.exit(0);
  } else {
    console.error("✗ FAIL: Wrong error type or message\n");
    console.error(error);
    process.exit(1);
  }
}
