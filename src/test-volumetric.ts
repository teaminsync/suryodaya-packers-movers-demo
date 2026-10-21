/**
 * Manual test script for volumetric estimation
 * Usage: npx tsx src/test-volumetric.ts <path-to-image-or-video> [--twice]
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { aiRouter } from "./ai/router.js";
import { analyzeMediaCapture } from "./flows/volumetric.js";
import { buildInventoryGroups } from "./flows/rooms.js";

const filePath = process.argv[2];
const runTwice = process.argv[3] === "--twice";

if (!filePath) {
  console.error("Usage: npx tsx src/test-volumetric.ts <path-to-local-image-or-video-file> [--twice]");
  console.error("\nSupported formats:");
  console.error("  Images: .jpg, .jpeg, .png, .webp");
  console.error("  Video: .mp4");
  console.error("\nOptions:");
  console.error("  --twice  Run analysis twice (second time with de-dupe context from first)");
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
console.log(`Base64 encoded length: ${base64Data.length} characters`);
if (runTwice) {
  console.log(`Mode: Running twice (second run with de-dupe context)`);
}
console.log();

// Initialize AI router
console.log("Initializing AI router...");
await aiRouter.initialize();
console.log("✓ AI router initialized\n");

// Function to print result
function printResult(result: any, runLabel: string) {
  console.log(`=== ANALYSIS COMPLETE (${runLabel}) ===\n`);
  console.log(`Provider used: ${result.providerUsed}`);
  console.log(`Was failover: ${result.wasFailover}\n`);

  console.log("=== ROOM RESOLUTION ===\n");
  console.log(`Room key: ${result.room.roomKey}`);
  console.log(`Room qualifier: ${result.room.qualifier ?? "null"}`);
  console.log(`Room label: ${result.room.label}`);
  console.log(`Same room as: ${result.data.sameRoomAs ?? "null"}`);
  console.log(`Matched existing: ${result.room.matchedExisting}`);

  console.log("\n=== TOTALS ===\n");
  console.log(`Cubic feet (new items): ${result.totals.cubicFeet}`);
  console.log(`Weight kg (new items): ${result.totals.weightKg}`);
  console.log(`New item count: ${result.totals.newItemCount}`);
  console.log(`Duplicate item count: ${result.totals.duplicateItemCount}`);

  console.log("\n=== VOLUMETRIC ESTIMATE DATA ===\n");
  console.log(`Asset type: ${result.data.assetType}`);
  console.log(`Packing complexity: ${result.data.packingComplexity}`);
  console.log(`Confidence: ${result.data.confidence}`);

  if (result.data.specialHandlingNotes.length > 0) {
    console.log(`\nSpecial handling notes:`);
    result.data.specialHandlingNotes.forEach((note: string) => console.log(`  - ${note}`));
  }

  if (result.data.items.length > 0) {
    console.log(`\n=== ITEM DETAILS (${result.data.items.length} items) ===\n`);
    result.data.items.forEach((item: any, idx: number) => {
      console.log(`${idx + 1}. ${item.name} (x${item.quantity})`);
      console.log(`   Volume: ${item.estimatedCubicFeet} cu ft`);
      console.log(`   Weight: ${item.estimatedWeightKg} kg`);
      console.log(`   Fragile: ${item.fragile ? "Yes" : "No"}`);
      console.log(`   Already counted: ${item.alreadyCounted ? "Yes" : "No"}`);
    });
  }
}

// Run first analysis
console.log("Analyzing media (first run)...\n");

const startTime = Date.now();

try {
  const result = await analyzeMediaCapture(
    mediaType === "image"
      ? { type: "image", mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp", base64Data }
      : { type: "video", base64Data }
  );

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  printResult(result, `First run, ${elapsedSec}s`);

  if (runTwice) {
    // Build inventory from first run
    const inventory = buildInventoryGroups([{
      room_key: result.room.roomKey,
      room_qualifier: result.room.qualifier,
      items: JSON.stringify(result.data.items),
    }]);

    console.log("\n\n=== SECOND RUN (same file, already-counted context supplied) ===\n");
    console.log("Existing inventory context:");
    if (inventory.length > 0) {
      inventory.forEach((group) => {
        console.log(`  - ${group.label}: ${group.items.map((i) => `${i.name} (${i.quantity})`).join(", ")}`);
      });
    } else {
      console.log("  (empty)");
    }
    console.log("\nAnalyzing media (second run)...\n");

    const secondStartTime = Date.now();
    const secondResult = await analyzeMediaCapture(
      mediaType === "image"
        ? { type: "image", mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp", base64Data }
        : { type: "video", base64Data },
      inventory
    );

    const secondElapsedMs = Date.now() - secondStartTime;
    const secondElapsedSec = (secondElapsedMs / 1000).toFixed(2);

    printResult(secondResult, `Second run, ${secondElapsedSec}s`);
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
