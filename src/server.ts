/**
 * Minimal Express server for WhatsApp webhook
 */

import "dotenv/config";
import express from "express";
import { verifyWebhook, handleWebhook } from "./whatsapp/webhook.js";
import { aiRouter } from "./ai/router.js";
import { initializeDatabase } from "./leads/db.js";
import internalRoutes from "./routes/internal.js";

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.WHATSAPP_APP_SECRET) {
  throw new Error("WHATSAPP_APP_SECRET is required to verify WhatsApp webhook signatures");
}

// Initialize database
await initializeDatabase();

// Initialize AI router
await aiRouter.initialize();
console.log("\u2705 AI Router initialized");

// Parse JSON bodies
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WhatsApp webhook routes
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleWebhook);

// Internal API routes
app.use("/internal", internalRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`\u2705 Server listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
