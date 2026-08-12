/**
 * Minimal Express server for WhatsApp webhook
 */

import "dotenv/config";
import express from "express";
import { verifyWebhook, handleWebhook } from "./whatsapp/webhook.js";
import { aiRouter } from "./ai/router.js";
import { initializeDatabase } from "./leads/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
await initializeDatabase();

// Initialize AI router
await aiRouter.initialize();
console.log("✅ AI Router initialized");

// Parse JSON bodies
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WhatsApp webhook routes
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleWebhook);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
