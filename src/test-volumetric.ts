/**
 * Manual test script for volumetric estimation
 * Usage: npx tsx src/test-volumetric.ts <path-to-image-or-video>
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { aiRouter } from "./ai/router.js";
import { analyzeMediaCapture } from "./flows/volumetric.js";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npx tsx src/test-volumetric.ts <path-to-local-image-or-video-file>");
  console.error("\nSupported formats:");
  console.error("  Images: .jpg, .jpeg, .png, .webp");
  console.error("  Video: .mp4");
  process.exit(1);
}

console.log(`\n=== Testing volumetric estimation with: ${filePath} ===\n`);

// Detect media type from extension
const lowerPath = filePath.toLowerCase();
let mediaType: "image" | "video";
let mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4";

if (lowerPath.endsWith(".mp4")) {
  mediaType = "video";
  mimeType = "video/mp4";
} else if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
  mediaType = "image";
  mimeType = "image/jpeg";
} else if (lowerPath.endsWith(".png")) {
  mediaType = "image";
  mimeType = "image/png";
} else if (lowerPath.endsWith(".webp")) {
  mediaType = "image";
  mimeType = "image/webp";
} else {
  console.error("Unsupported file format. Use .jpg, .jpeg, .png, .webp, or .mp4");
  process.exit(1);
}

console.log(`Detected media type: ${mediaType} (${mimeType})`);

// Read and encode file
const fileBuffer = readFileSync(filePath);
const base64Data = fileBuffer.toString("base64");
const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

console.log(`File size: ${fileSizeMB} MB`);
console.log(`Base64 encoded length: ${base64Data.length} characters\n`);

// Initialize AI router
console.log("Initializing AI router...");
await aiRouter.initialize();
console.log("✓ AI router initialized\n");

// Run analysis
console.log("Analyzing media...\n");

const startTime = Date.now();

try {
  const result = await analyzeMediaCapture(
    mediaType === "image"
      ? { type: "image", mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp", base64Data }
      : { type: "video", base64Data }
  );

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  console.log("=== ANALYSIS COMPLETE ===\n");
  console.log(`Elapsed time: ${elapsedMs}ms (${elapsedSec}s)`);
  console.log(`Provider used: ${result.providerUsed}`);
  console.log(`Was failover: ${result.wasFailover}\n`);

  console.log("=== VOLUMETRIC ESTIMATE ===\n");
  console.log(JSON.stringify(result.data, null, 2));

  console.log("\n=== SUMMARY ===\n");
  console.log(`Asset type: ${result.data.assetType}`);
  console.log(`Room label: ${result.data.suggestedRoomLabel || "N/A"}`);
  console.log(`Items detected: ${result.data.items.length}`);
  console.log(`Total volume: ${result.data.totalEstimatedCubicFeet} cubic feet`);
  console.log(`Total weight: ${result.data.totalEstimatedWeightKg} kg`);
  console.log(`Packing complexity: ${result.data.packingComplexity}`);
  console.log(`Confidence: ${result.data.confidence}`);

  if (result.data.specialHandlingNotes.length > 0) {
    console.log(`\nSpecial handling notes:`);
    result.data.specialHandlingNotes.forEach((note) => console.log(`  - ${note}`));
  }

  if (result.data.items.length > 0) {
    console.log(`\n=== ITEM DETAILS ===\n`);
    result.data.items.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.name} (x${item.quantity})`);
      console.log(`   Volume: ${item.estimatedCubicFeet} cu ft`);
      console.log(`   Weight: ${item.estimatedWeightKg} kg`);
      console.log(`   Fragile: ${item.fragile ? "Yes" : "No"}`);
    });
  }

  console.log("\n✓ Test completed successfully\n");
} catch (error) {
  const elapsedMs = Date.now() - startTime;
  console.error("\n✗ Analysis failed\n");
  console.error(`Elapsed time: ${elapsedMs}ms`);
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(`\nStack trace:\n${error.stack}`);
  }
  process.exit(1);
}
