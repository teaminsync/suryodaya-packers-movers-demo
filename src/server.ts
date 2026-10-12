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
app.disable("x-powered-by");
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

// Error handler (must be after all routes)
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const rawStatus = (err as { status?: number } | null)?.status;
  const status = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 500 ? 400 : 500;
  console.error("[Server] Request error:", {
    method: req.method,
    path: req.path,
    status,
    message: err instanceof Error ? err.message : String(err),
  });
  res.status(status).json({ error: status === 400 ? "bad request" : "internal error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`\u2705 Server listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
