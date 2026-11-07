# Testing: Express backend

Last reviewed 4 November 2026 (Express `85a6e03`, 75 suites, 1047 tests).

## 1. Automated tests

```powershell
npm run build          # tsc, must be clean (noUnusedLocals is on)
npm run test:unit      # fast, offline; the list of files is in package.json
```

- `npm run test:unit` runs an explicit list of test files. **When you add a test file, append its name to that list**, or it will silently never run.
- Tests are Jest in ESM mode (`node --experimental-vm-modules`). Test files import from `@jest/globals`.
- Logic is kept in **pure modules** (no database, network or `process.env`) with dependencies injected, so the rules are unit-testable: policy, planner, parsers, message builders, the scheduler tick, the settings provider, token logic and delivery extraction. Thin `*-db.ts` files wire these to SQL and are covered by the live checks below, not by unit tests.
- `npm test` runs every Jest test; live tests inside it only run when `RUN_LIVE_TESTS=true`.

## 2. Live provider tests (cost money)

```powershell
npm run test:live:gemini
npm run test:live:claude
npm run test:live:failover
```

The Claude test requires a **funded** Anthropic account. With an unfunded key the router logs `[Claude] Key validation failed: HTTP 400 invalid_request_error: Your credit balance is too low ...` and skips Claude, and the live test fails its "expected PRODUCTION mode" guard. That is a billing problem, not a code problem. To try Claude in the real chat path, set `AI_TEXT_CHAIN=claude,gemini,groq`, restart, and check that the startup line reads `text: claude -> gemini -> groq` and replies log `providerUsed: "claude"`. Restore the demo chain afterwards.

## 3. Conformance

`npm run conformance` runs the AI against scripted scenarios and checks its answers against the company facts (options: `CONFORMANCE_ONLY`, `CONFORMANCE_PROVIDER`; see `src/conformance/run.ts`). Run it before any prospect session. Scenario S05 (insurance) matters most: the model must not claim insurance is offered.

## 4. Manual live checklists

Use the WhatsApp test number and the dashboard. For fast timings set the `FOLLOWUPS_*` values noted in `.env.example`, and **remove those overrides afterwards**.

**Survey settings**
1. Settings shows "Using .env defaults". Add tomorrow as a holiday, save, ask for a survey: tomorrow is not offered, with no restart.
2. Change the end time, save, ask again: no offered slot ends after it.
3. Enter a survey length of 5: blocked in the form and nothing is saved.
4. Reset to defaults: slots return to normal. In SQL, `select relrowsecurity from pg_class where relname = 'survey_settings'` is true and `has_table_privilege('anon','public.survey_settings','select')` is false.

**Duplicate-photo handling**
1. Send a sofa photo twice: the second reply says it is already counted. "Get My Move Total" is unchanged.
2. Send a bedroom photo, then again, reply "this is the kids bedroom": it files under Kids Bedroom. "same day" and "I want the same price" must go to the AI, not the room logic.

**Follow-ups** (`FOLLOWUPS_ENABLED=true`, optionally `FOLLOWUPS_DRY_RUN=true` first)
1. Dry run logs `DRY RUN would send` and sends nothing; the dashboard badge reads "Dry run".
2. Live: a missing-details text, then a check-in nudge arrive. Reply `yes`: numbered slots, no AI call. Reply `yes` again after another message: it goes to the AI.
3. Cancel an item in Up next: it moves to History as Cancelled and never sends.
4. STOP: confirm the unsubscribe text and that Up next empties. Re-grant consent from the Outreach card before the next test.
5. Reminder: book a survey, stay silent past the window; the `survey_reminder` template arrives with buttons. Tap Confirm time and Change time; both taps appear in the dashboard chat.
6. A contact with an old unbooked lead plus a newer one: only the newer lead is ever nudged.

**Failures**
1. Calendar failure: temporarily alter `GOOGLE_CALENDAR_ID`, book a slot. Expect the "we'll confirm" text, an alert titled "Survey booked, calendar not updated" and a red calendar badge. Restore the ID.
2. Delivery card: `npx tsx src/delivery-simulate.ts <digits>` shows the card; `--clear` removes it.
3. Rebooking: book a later slot then an earlier one; Up next follows the latest and the old calendar event disappears.

**Lifecycle and Instagram**
1. Auto-close: booked leads whose survey ended more than 48 hours ago and with no recent inbound message get `closed_at`; the active lead stays open.
2. Instagram token: Settings shows "valid for about 59 more day(s)" after a restart. Pressing Refresh now straight after is refused (a day must pass). Setting `expires_at` to five days ahead in SQL shows an amber banner in the dashboard header.
3. Send an Instagram DM: the bot replies.

## 4a. Safe SQL helpers

```sql
-- inspect without exposing secrets
select provider, refreshed_at, expires_at, last_error from integration_tokens;
select * from consents where contact_id = '<id>' order by captured_at desc;
select id, status, closed_at, created_at from leads where contact_id = '<id>' order by created_at;
```

Never select the `access_token` column or paste tokens into chat.

## 5. Not covered by automation (gaps)

The SQL wiring in `*-db.ts` files, the webhook as a whole, real Meta failure payloads and the Claude production chain have no automated test. Cover them with the checklists above before any change that touches them.
