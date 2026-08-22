/**
 * Query messages table to verify records
 */
import "dotenv/config";
import { sql } from "./leads/db.js";

async function queryMessages() {
  try {
    const leadId = process.argv[2];
    
    if (!leadId) {
      console.log("Usage: npm run query-messages <lead_id>");
      process.exit(1);
    }

    const messages = await sql`
      SELECT 
        id,
        lead_id,
        wamid,
        direction,
        sender_type,
        message_type,
        body,
        media_capture_id,
        created_at
      FROM messages
      WHERE lead_id = ${leadId}
      ORDER BY created_at ASC
    `;

    console.log(`\n=== Found ${messages.length} message(s) for lead ${leadId} ===\n`);

    for (const msg of messages) {
      console.log("─".repeat(80));
      console.log(`ID: ${msg.id}`);
      console.log(`WAMID: ${msg.wamid || "null (outbound)"}`);
      console.log(`Direction: ${msg.direction}`);
      console.log(`Sender Type: ${msg.sender_type}`);
      console.log(`Message Type: ${msg.message_type}`);
      console.log(`Body: ${msg.body || "null"}`);
      console.log(`Media Capture ID: ${msg.media_capture_id || "null"}`);
      console.log(`Created: ${msg.created_at}`);
      console.log("");
    }

    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error("Query failed:", error);
    process.exit(1);
  }
}

queryMessages();
