/**
 * Minimal Express server for WhatsApp webhook
 */

import "dotenv/config";
import express from "express";
import { verifyWebhook, handleWebhook } from "./whatsapp/webhook.js";
import { aiRouter } from "./ai/router.js";
import { initializeDatabase } from "./leads/db.js";
import internalRoutes from "./routes/internal.js";
import intakeRoutes from "./routes/intake.js";

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;

if (!process.env.WHATSAPP_APP_SECRET) {
  throw new Error("WHATSAPP_APP_SECRET is required to verify WhatsApp webhook signatures");
}

if (!process.env.INDIAMART_PUSH_TOKEN) {
  console.warn("[Intake] INDIAMART_PUSH_TOKEN is not set: the IndiaMART intake endpoint is disabled (every request gets 404)");
} else if (process.env.INDIAMART_PUSH_TOKEN.length < 32) {
  console.warn("[Intake] INDIAMART_PUSH_TOKEN is shorter than 32 characters: use a longer random value");
}

// Instagram configuration check
if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
  console.warn("[Instagram] INSTAGRAM_ACCESS_TOKEN is not set");
}
if (!process.env.INSTAGRAM_ACCOUNT_ID) {
  console.warn("[Instagram] INSTAGRAM_ACCOUNT_ID is not set");
}
if (!process.env.INSTAGRAM_APP_SECRET) {
  console.warn("[Instagram] INSTAGRAM_APP_SECRET is not set");
}
if (!process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
  console.warn("[Instagram] INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set");
}
if (process.env.INSTAGRAM_DRY_RUN === "true") {
  console.warn("[Instagram] Instagram dry-run mode: no messages are sent");
}

// Initialize database
await initializeDatabase();

// Initialize AI router
await aiRouter.initialize();
console.log("\u2705 AI Router initialized");

// Check AI chain configuration
const { aiChainWarnings } = await import("./ai/startup-warnings.js");
const { resolveChain, defaultTextChain, defaultImageChain } = await import("./ai/chain-config.js");

const aiKeys = {
  claude: !!process.env.ANTHROPIC_API_KEY,
  gemini: !!process.env.GEMINI_API_KEY,
  groq: !!process.env.GROQ_API_KEY,
};

const textChainResolved = resolveChain(process.env.AI_TEXT_CHAIN, aiKeys, defaultTextChain(aiKeys));
const imageChainResolved = resolveChain(process.env.AI_IMAGE_CHAIN, aiKeys, defaultImageChain(aiKeys));

const warnings = aiChainWarnings({
  anthropicKeySet: aiKeys.claude,
  textChain: textChainResolved.names,
  imageChain: imageChainResolved.names,
});

for (const warning of warnings) {
  console.warn(`[AI Router] ${warning}`);
}

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

// Instagram webhook routes (mounted before /webhook to avoid conflict)
const { instagramRoutes } = await import("./instagram/route.js");
app.use("/webhook/instagram", instagramRoutes);

// WhatsApp webhook routes
app.get("/webhook", verifyWebhook);
app.post("/webhook", handleWebhook);

// Internal API routes
app.use("/internal", internalRoutes);

// Intake routes
app.use("/intake", intakeRoutes);

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
app.listen(PORT, async () => {
  console.log(`\u2705 Server listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  try {
    const { describeNotifyChannels } = await import("./notify/notify-db.js");
    console.log("[Notify] Admin alerts:", describeNotifyChannels());
  } catch (error) {
    console.log("[Notify] Could not read alert settings:", error instanceof Error ? error.message : String(error));
  }

  try {
    const { describeCalendar } = await import("./calendar/calendar-db.js");
    console.log("[Calendar] Survey scheduling:", describeCalendar());
  } catch (error) {
    console.log("[Calendar] Setup error:", error instanceof Error ? error.message : String(error));
  }
});
