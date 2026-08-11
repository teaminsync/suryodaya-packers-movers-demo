# Testing Guide - AI Layer Real Validation

This document contains instructions for running the **REAL API tests** required by Spec 01, Section 6.

## ⚠️ Important Notes

- These tests make **REAL API calls** to Claude and Gemini
- They will **consume API credits**
- Only run when explicitly needed for validation
- You will need to **paste back terminal output** as evidence

## Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your `.env` file based on which tests you're running (see below)

## Test 6.1: Live Gemini (DEMO Mode)

**Purpose**: Prove Gemini works standalone in DEMO mode

**Requirements**:
- `GEMINI_API_KEY` must be set
- `ANTHROPIC_API_KEY` must NOT be set (or be invalid)

**Setup**:
```bash
# In your .env file:
GEMINI_API_KEY=your_actual_gemini_key
GEMINI_MODEL=gemini-3.6-flash

# Make sure this is NOT set or is commented out:
# ANTHROPIC_API_KEY=
```

**Run**:
```bash
npm run test:live:gemini
```

**What to paste back**:
1. The startup log line showing "AI mode: DEMO"
2. Full terminal output for both tests (text-only and vision)
3. The structured log lines for each call
4. Confirmation of `providerUsed: "gemini"` and `wasFailover: false`

---

## Test 6.2: Live Claude (PRODUCTION Mode)

**Purpose**: Prove Claude works and that valid key enables PRODUCTION mode

**Requirements**:
- `GEMINI_API_KEY` must be set (fallback provider)
- `ANTHROPIC_API_KEY` must be set **and valid**

**Setup**:
```bash
# In your .env file:
GEMINI_API_KEY=your_actual_gemini_key
GEMINI_MODEL=gemini-3.6-flash

ANTHROPIC_API_KEY=your_actual_anthropic_key
CLAUDE_MODEL=claude-sonnet-5
```

**Run**:
```bash
npm run test:live:claude
```

**What to paste back**:
1. The startup log line showing "AI mode: PRODUCTION (Anthropic key validated...)"
2. Full terminal output for both tests (text-only and vision)
3. The structured log lines for each call
4. Confirmation of `providerUsed: "claude"` and `wasFailover: false`

---

## Test 6.3: Forced Failover (PRODUCTION Mode)

**Purpose**: Prove the failover mechanism actually works when Claude fails

**Requirements**:
- Same setup as 6.2 (PRODUCTION mode)
- Test will **temporarily corrupt** `CLAUDE_MODEL` to force failure
- Test will restore the original value after running

**Setup**:
```bash
# Same as Test 6.2 - start with valid keys in PRODUCTION mode
GEMINI_API_KEY=your_actual_gemini_key
ANTHROPIC_API_KEY=your_actual_anthropic_key
CLAUDE_MODEL=claude-sonnet-5
```

**Run**:
```bash
npm run test:live:failover
```

**Expected behavior**:
1. Router initializes in PRODUCTION mode (Claude primary, Gemini fallback)
2. Test corrupts `CLAUDE_MODEL` to trigger a Claude API error (404/400)
3. Router logs the Claude failure
4. Router automatically tries Gemini
5. Request succeeds via Gemini with `wasFailover: true`
6. Test restores original `CLAUDE_MODEL`

**What to paste back**:
1. The startup log showing PRODUCTION mode
2. The warning log showing corrupted CLAUDE_MODEL
3. The full log sequence showing:
   - Claude failure (with reason)
   - Automatic Gemini call
   - Success with `wasFailover: true`
4. The final response data proving the request actually completed

---

## Unit Tests (Mocked)

These don't make real API calls - they test routing logic with mocks.

**Run**:
```bash
npm run test:unit
```

No special setup needed - these always pass if the router logic is correct.

---

## Troubleshooting

### "GEMINI_API_KEY is required"
- You forgot to set `GEMINI_API_KEY` in `.env`
- Or you're running tests without the `.env` file loaded

### "Expected PRODUCTION mode, got DEMO"
- Your `ANTHROPIC_API_KEY` is not set, invalid, or failed validation
- Check the API key is correct and has permissions
- Check the startup log for validation failure details

### "All AI providers failed"
- Both providers failed (in PRODUCTION mode)
- Check both API keys are valid
- Check you have API credits remaining
- Check network connectivity

### Test hangs / times out
- The default timeout is 30s for text, 60s for vision
- If your network is slow or API is under load, this might not be enough
- Check the debug logs to see where it's stuck

---

## Cost Estimates

Approximate API costs per test run (as of Aug 2026):

- **Gemini 3.6 Flash**: Free tier covers testing, or ~$0.0001 per request
- **Claude Sonnet 5**: ~$0.003 per text request, ~$0.015 per vision request

Running all three test suites: < $0.05 total

---

## Evidence Checklist

For each test (6.1, 6.2, 6.3), provide:

- [ ] Complete terminal output (copy-paste, not summary)
- [ ] Startup mode detection log line
- [ ] Structured call result JSON logs
- [ ] Raw response data showing schema compliance
- [ ] Confirmation of `providerUsed` and `wasFailover` values
- [ ] Any warnings or unexpected behavior

---

## Next Steps After Tests Pass

Once you have clean output from all three test suites:

1. Paste the full terminal output back to the spec author
2. Include any warnings or unexpected behavior
3. Wait for sign-off before moving to the next spec (WhatsApp integration)

The evidence proves:
- Mode detection works correctly
- Both providers work standalone
- Failover actually triggers and recovers
- Schema validation catches bad responses
- Logging captures what we need for debugging
