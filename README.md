# Suryodaya Packers & Movers - AI Automation Demo

Provider-agnostic AI layer with automatic failover for a moving company automation system.

## Architecture

This project implements a **provider-agnostic AI layer** that automatically switches between Claude (Anthropic) and Gemini (Google) based on available API keys, backed by **Supabase Postgres** for persistent data storage:

### AI Layer
- Provider-agnostic design with automatic provider selection based on available API keys and chain configuration
- Supports Claude (Anthropic), Gemini (Google), and Groq (text and vision)
- Configure provider priority using AI_TEXT_CHAIN and AI_IMAGE_CHAIN settings

The system uses TypeScript for strong typing across provider adapters, ensuring consistent request/response shapes and catching schema drift at compile time.

### Data Layer
- **Supabase Postgres** via direct connection (postgres.js)
- Self-initializing schema (runs on startup, no manual SQL required)
- Real BOOLEAN and TIMESTAMPTZ types for production-grade data integrity
- Connection pooling via postgres.js (max 10 connections, configurable timeouts)

**Connection troubleshooting**: Supabase's Direct connection defaults to IPv6. If the server hangs on startup with database connection errors, switch to the **Session pooler** connection string (IPv4-compatible) - same database, different endpoint format. No code changes needed, just update `DATABASE_URL` in `.env`.

## Setup

### Prerequisites

- Node.js 20+ LTS
- npm or yarn

### Installation

```bash
npm install
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Required in all modes:
```
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-3.6-flash
```

#### Optional (enables additional providers and custom chains):
```
ANTHROPIC_API_KEY=your_anthropic_key_here
CLAUDE_MODEL=claude-sonnet-5-5
GROQ_API_KEY=your_groq_key_here
# Comma-separated provider chains (auto-selected from available keys if not specified)
AI_TEXT_CHAIN=groq,gemini
AI_IMAGE_CHAIN=groq,gemini
```

#### Database (required):
```
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

Get this from your Supabase project dashboard → Settings → Database → Connection string (Direct connection format).

**Important**: Use the **Direct connection** string by default. If you experience connection hangs or timeouts (likely an IPv6 issue), switch to the **Session pooler** connection string instead.

**Model strings verified from official docs:**
- Claude: `claude-sonnet-5` from [platform.claude.com/docs](https://platform.claude.com/docs/en/about-claude/models/overview)
- Gemini: `gemini-3.6-flash` from [ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs/latest-model)

## Running

### Development Mode
```bash
npm run dev
```

### Build & Run Production
```bash
npm run build
npm start
```

## Testing

**Current status**: Live tests are available for Gemini, Claude, and failover scenarios. Tests verify AI provider configuration and chain behavior.

### Unit Tests (mocked providers)
```bash
npm run test:unit
```

### Live API Tests (REAL calls)

**Important**: Live tests make real API calls and consume API credits. Only run when explicitly needed.

#### Test 6.1: Live Gemini
```bash
npm run test:live:gemini
```

#### Test 6.2: Live Claude
```bash
npm run test:live:claude
```

#### Test 6.3: Forced failover
```bash
npm run test:live:failover
```

See `TESTING.md` for detailed instructions and evidence requirements.

## Project Structure

```
src/
├── ai/
│   ├── types.ts                    # Canonical request/response types + zod schemas
│   ├── router.ts                   # Main entry point - auto-detection & failover logic
│   ├── errors.ts                   # Typed error classes
│   ├── providers/
│   │   ├── provider.interface.ts   # Provider contract
│   │   ├── claude.ts               # Claude (Anthropic) adapter
│   │   └── gemini.ts               # Gemini (Google) adapter
│   └── tests/
│       ├── router.test.ts          # Unit tests with mocks
│       ├── live-gemini.test.ts     # REAL: Section 6.1
│       ├── live-claude-fallback.test.ts  # REAL: Section 6.2
│       └── forced-failover.test.ts # REAL: Section 6.3
├── leads/
│   ├── db.ts                       # Postgres connection & schema init
│   ├── repository.ts               # Data access layer (CRUD)
│   └── types.ts                    # Lead, BookingOffer, ProcessedMessage types
├── flows/
│   ├── qualification.ts            # AI-powered lead qualification
│   ├── acknowledgment.ts           # Instant ack with trust signals
│   └── booking.ts                  # Slot generation & selection
├── whatsapp/
│   ├── client.ts                   # WhatsApp Cloud API client
│   ├── webhook.ts                  # Webhook handlers & orchestration
│   └── types.ts                    # WhatsApp payload types
├── company/
│   └── profile.ts                  # Company facts & ballpark pricing
├── server.ts                       # Express server
├── query-lead.ts                   # Dev utility for inspecting leads
└── index.ts                        # Application entry point
```

## Usage Example

```typescript
import { aiRouter } from "./ai/router.js";
import { z } from "zod";

// Initialize once at startup
await aiRouter.initialize();

// Define response schema
const leadSchema = z.object({
  moveType: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
});

// Make request - router handles provider selection & failover automatically
const response = await aiRouter.call({
  systemPrompt: "You classify moving enquiries.",
  userPrompt: "Need to move 2BHK next week",
  responseSchema: leadSchema,
  taskName: "lead_qualification",
});

console.log(response.data);          // { moveType: "local", urgency: "high" }
console.log(response.providerUsed);  // "claude" or "gemini"
console.log(response.wasFailover);   // true if fallback was used
```

## Provider Selection Logic

The router automatically selects providers based on available API keys and chain configuration:

1. **Chain configuration** (if `AI_TEXT_CHAIN` or `AI_IMAGE_CHAIN` are set): Uses the specified provider order
2. **Auto-detection** (default): Selects available providers based on which API keys are configured

## Failover Behavior

### With Multiple Providers Configured
- Try the first provider in the chain
- On failure (HTTP error, timeout, or schema validation failure):
  - Log specific failure reason
  - Automatically invoke the next provider in the chain
  - Return response with `wasFailover: true`
- If all providers fail: throw `AIAllProvidersFailed` with all error details

### Single Provider Configured
- Try the configured provider
- On failure: throw error (no fallback available)

## Logging

Every AI call generates a structured log line:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "taskName": "lead_qualification",
  "mode": "PRODUCTION",
  "providerUsed": "claude",
  "wasFailover": false,
  "latencyMs": 1234,
  "success": true
}
```

Failures include `errorReason` field for debugging.

## Next Steps

This module provides **production-grade foundation code** with:
- ✅ Provider-agnostic AI layer with automatic failover
- ✅ WhatsApp Cloud API integration (bidirectional messaging)
- ✅ Supabase Postgres persistence with transactional guarantees
- ✅ Lead qualification and instant acknowledgment
- ✅ Booking slot management
- ✅ Message deduplication (idempotency)

Future enhancements may include:
- Volumetric estimation from images
- E-way bill and GST documentation generation
- Post-move review automation
- Real-time ops dashboard via Supabase Realtime

## License

MIT
