# Suryodaya Packers & Movers - AI Automation Demo

Provider-agnostic AI layer with automatic failover for a moving company automation system.

## Architecture

This project implements a **provider-agnostic AI layer** that automatically switches between Claude (Anthropic) and Gemini (Google) based on available API keys:

- **DEMO mode**: Gemini primary, no fallback (no Anthropic key required)
- **PRODUCTION mode**: Claude primary, Gemini fallback (Anthropic key validated at startup)

The system uses TypeScript for strong typing across provider adapters, ensuring consistent request/response shapes and catching schema drift at compile time.

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
GEMINI_MODEL=gemini-1.5-flash
```

#### Optional (enables PRODUCTION mode):
```
ANTHROPIC_API_KEY=your_anthropic_key_here
CLAUDE_MODEL=claude-3-5-sonnet-20241022
```

#### Optional override (for local dev):
```
AI_FORCE_PROVIDER=gemini    # or "claude"
```

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

### Unit Tests (mocked providers)
```bash
npm test
```

### Live API Tests (REAL calls)

**Important**: Live tests make real API calls and consume API credits. Only run when explicitly needed.

#### Test 6.1: Gemini in DEMO mode
```bash
# Ensure ANTHROPIC_API_KEY is NOT set
RUN_LIVE_TESTS=true npm test -- live-gemini
```

#### Test 6.2: Claude in PRODUCTION mode
```bash
# Ensure ANTHROPIC_API_KEY IS set and valid
RUN_LIVE_TESTS=true npm test -- live-claude-fallback
```

#### Test 6.3: Forced failover
```bash
# Requires valid ANTHROPIC_API_KEY set initially
# Test will temporarily corrupt CLAUDE_MODEL to trigger failover
RUN_LIVE_TESTS=true npm test -- forced-failover
```

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

## Mode Detection Logic

The router automatically detects which mode to run in:

1. **Manual override** (if `AI_FORCE_PROVIDER` is set): Use specified provider, bypass auto-detection
2. **Auto-detection** (default):
   - If `ANTHROPIC_API_KEY` is present and validates → **PRODUCTION mode** (Claude primary, Gemini fallback)
   - If no valid Anthropic key → **DEMO mode** (Gemini primary, no fallback)

## Failover Behavior

### PRODUCTION Mode (Claude primary, Gemini fallback)
- Try Claude first
- On failure (HTTP error, timeout, or schema validation failure):
  - Log specific failure reason
  - Automatically invoke Gemini
  - Return response with `wasFailover: true`
- If both fail: throw `AIAllProvidersFailed` with both error details

### DEMO Mode (Gemini primary, no fallback)
- Try Gemini
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

This module is **foundation code** - the following features will be built on top of it in subsequent specs:

- WhatsApp Cloud API integration (Section 7)
- Lead qualification logic
- Urgency scoring
- Volumetric estimation from images
- Quote drafting
- Follow-up message generation

## License

MIT
