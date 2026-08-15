/**
 * Query media_captures table to verify records
 */
import "dotenv/config";
import { sql } from "./leads/db.js";

async function queryMediaCaptures() {
  try {
    const captures = await sql`
      SELECT 
        id,
        lead_id,
        wamid,
        media_type,
        storage_path,
        asset_type,
        suggested_room_label,
        items,
        total_estimated_cubic_feet,
        total_estimated_weight_kg,
        packing_complexity,
        special_handling_notes,
        confidence,
        ai_provider_used,
        ai_was_failover,
        created_at
      FROM media_captures
      ORDER BY created_at DESC
    `;

    console.log(`\n=== Found ${captures.length} media capture(s) ===\n`);

    for (const capture of captures) {
      console.log("─".repeat(80));
      console.log(`ID: ${capture.id}`);
      console.log(`Lead ID: ${capture.lead_id}`);
      console.log(`WAMID: ${capture.wamid}`);
      console.log(`Media Type: ${capture.media_type}`);
      console.log(`Storage Path: ${capture.storage_path || "null (upload failed)"}`);
      console.log(`Asset Type: ${capture.asset_type}`);
      console.log(`Suggested Room: ${capture.suggested_room_label}`);
      console.log(`Items: ${capture.items}`);
      console.log(`Volume: ${capture.total_estimated_cubic_feet} cu ft`);
      console.log(`Weight: ${capture.total_estimated_weight_kg} kg`);
      console.log(`Complexity: ${capture.packing_complexity}`);
      console.log(`Special Handling: ${capture.special_handling_notes}`);
      console.log(`Confidence: ${capture.confidence}`);
      console.log(`AI Provider: ${capture.ai_provider_used}, Failover: ${capture.ai_was_failover}`);
      console.log(`Created: ${capture.created_at}`);
      console.log("");
    }

    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error("Query failed:", error);
    process.exit(1);
  }
}

queryMediaCaptures();
