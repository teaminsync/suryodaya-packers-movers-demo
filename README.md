# Suryodaya Packers & Movers: Backend (Express)

AI-assisted lead handling for a **fictional** packers and movers company (Suryodaya Packers & Movers Pvt. Ltd., Pune, 19 employees). This repo is the **Express backend**: it owns every write, receives WhatsApp, Instagram and IndiaMART traffic, runs the AI conversation, books surveys on Google Calendar and sends the team its alerts.

The operator-facing UI lives in the companion repo, [`suryodaya-dashboard`](../suryodaya-dashboard). The two are designed to be read together: start with [ARCHITECTURE.md](ARCHITECTURE.md).

> **Status (4 November 2026):** demo-complete. Express `85a6e03`, dashboard `df6cb88`. The Claude production path is built but **not verified with a funded key** (see [Known limits](#known-limits)).

> **The company is fictional.** The GST badge is text only; no GST number exists anywhere in this project and none must be invented. The company does **not** offer storage, vehicle transport or international moves, and the AI must never state a price except from the ballpark lookup table.

## Contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Configuration](#configuration)
4. [Scripts](#scripts)
5. [Repository map](#repository-map)
6. [WhatsApp templates](#whatsapp-templates)
7. [Operations](#operations)
8. [Demo script (10 minutes)](#demo-script-10-minutes)
9. [Known limits](#known-limits)
10. [Before going beyond a demo](#before-going-beyond-a-demo)

## What it does

| Area | Behaviour |
|---|---|
| **Intake** | WhatsApp Cloud API, Instagram DMs and IndiaMART push leads all become a *contact* with one or more *enquiries* (leads). |
| **Qualification** | One AI call per turn extracts move type, origin, destination, urgency, special items, volume and packing needs, and writes the reply. Prices come only from a ballpark lookup table. |
| **Photo and video estimates** | A room photo or video is analysed into itemised cubic feet and weight, grouped by room, with duplicates across photos de-duplicated. A human survey confirms before any quote is final. |
| **Survey booking** | Real Google Calendar availability, a free 15-30 minute on-site survey, confirmation, rebooking and cancellation of the previous event. |
| **Team alerts** | Email (Resend) and a WhatsApp `admin_alert` template for: survey booked, calendar not updated, customer wants a human, needs team follow-up. |
| **Follow-ups** | Consent-respecting reminders and nudges (off by default), with a 24-hour-window aware choice between free text and approved templates. |
| **Resilience** | Delivery failures are recorded, a failed calendar write is handled honestly, booked leads auto-close after the survey, and the Instagram token refreshes itself. |

## Quick start

**Prerequisites:** Node 22, a Supabase project (Postgres and Storage), a Meta app with the WhatsApp Cloud API test number, a Groq key and a Gemini key, ngrok (or another tunnel). Optional: an Instagram professional account, a Google service account with a calendar shared to it, Resend, an Anthropic key.

```powershell
npm install
copy .env.example .env      # then fill in the values
npm run server              # tsx src/server.ts on port 3000
```

On start you should see, in order: database connected and schema initialised, the AI profile line (for example `AI profile (DEMO): text: groq -> gemini | images: groq -> gemini | video: gemini`), `Server listening on port 3000`, the alert and calendar summaries, and the scheduler, lifecycle and Instagram-token lines.

1. Run `ngrok http 3000` and set the Meta webhook callback to `https://<your-tunnel>/webhook`, using `WHATSAPP_WEBHOOK_VERIFY_TOKEN` as the verify token.
2. The Meta test number can only message **recipients you have added** in the Meta dashboard.
3. Instagram has its own webhook: set the callback to `https://<your-tunnel>/webhook/instagram` with `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` as the verify token.
4. Start the dashboard from its own repo (port 3001) with the same `INTERNAL_API_SECRET`.

`GET /health` is a simple liveness check.

## Configuration

All settings are environment variables; [`.env.example`](.env.example) is the authoritative, commented list. Summary:

| Group | Variables |
|---|---|
| Server | `PORT`, `NGROK_AUTHTOKEN` (read by the ngrok CLI, not the app) |
| Database and storage | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` |
| Internal API | `INTERNAL_API_SECRET` (shared with the dashboard) |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_NUMBER` |
| Instagram | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_API_VERSION`, `INSTAGRAM_APP_SECRET` (+ `_ALT` for rotation), `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_DRY_RUN`, `INSTAGRAM_TOKEN_REFRESH_DAYS` (default 7, 0 disables) |
| IndiaMART | `INDIAMART_PUSH_TOKEN` |
| AI | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AI_TEXT_CHAIN`, `AI_IMAGE_CHAIN` |
| Admin alerts | `RESEND_API_KEY`, `ADMIN_EMAIL`, `ADMIN_EMAIL_FROM`, `ADMIN_WHATSAPP_NUMBER`, `ADMIN_WHATSAPP_TEMPLATE`, `DASHBOARD_BASE_URL`, `NOTIFY_DRY_RUN` |
| Survey scheduling | `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON`, and the twelve `SURVEY_*` values (see below) |
| Follow-ups | `FOLLOWUPS_*` (see below); **off unless `FOLLOWUPS_ENABLED=true`** |
| Lifecycle | `LEAD_AUTOCLOSE_HOURS` (default 48, 0 disables) |
| Conformance | `CONFORMANCE_ONLY`, `CONFORMANCE_PROVIDER` |

**AI chains.** Leave `AI_TEXT_CHAIN` and `AI_IMAGE_CHAIN` blank to auto-select from the keys present. The recommended demo profile is `AI_TEXT_CHAIN=groq,gemini` and `AI_IMAGE_CHAIN=groq,gemini`; video always uses Gemini and has no fallback. A listed provider whose key fails a one-token check is skipped, and the reason (HTTP status and Anthropic's message, never the key) is logged.

**Survey settings.** Working days, hours, lunch break, survey length, buffer, slot step, concurrency, minimum notice, maximum days ahead and holidays are set in `.env` as defaults (`SURVEY_WORKDAYS`, `SURVEY_WORK_START`, `SURVEY_WORK_END`, `SURVEY_BREAK_START`, `SURVEY_BREAK_END`, `SURVEY_DURATION_MINUTES`, `SURVEY_BUFFER_MINUTES`, `SURVEY_SLOT_STEP_MINUTES`, `SURVEY_CONCURRENCY`, `SURVEY_MIN_NOTICE_HOURS`, `SURVEY_MAX_DAYS_AHEAD`, `SURVEY_HOLIDAYS`) and can be overridden by the admin from the dashboard Settings page. The stored values win key by key, are cached for about 30 seconds, and "Reset to defaults" deletes them. Calendar ID and credentials are **never** editable from the dashboard.

**Follow-up settings** (defaults): `FOLLOWUPS_ENABLED=false`, `FOLLOWUPS_DRY_RUN=false`, `FOLLOWUPS_TICK_MINUTES=5`, `FOLLOWUPS_DAILY_CAP=20`, `FOLLOWUPS_SEND_FROM_HOUR=9`, `FOLLOWUPS_SEND_UNTIL_HOUR=20` (India time), `FOLLOWUPS_NUDGE_INWINDOW_HOURS=22`, `FOLLOWUPS_NUDGE_TEMPLATE_HOURS=48`, `FOLLOWUPS_MISSING_DETAILS_HOURS=3`, `FOLLOWUPS_REMINDER_HOURS_BEFORE=24`, `FOLLOWUPS_REMINDER_LATE_HOURS=3`, `FOLLOWUPS_MAX_NUDGES=2`. Fractional hours are accepted where noted in `.env.example`, which makes quick live tests possible.

## Scripts

| Command | Purpose |
|---|---|
| `npm run server` | Start the server with `tsx` (port 3000). |
| `npm run dev` | `tsx watch src/index.ts`. |
| `npm run build` / `npm start` | Compile with `tsc` / run `dist/index.js`. |
| `npm run test:unit` | The fast, offline unit suite (75 suites, 1047 tests at the last run). **Use this one.** |
| `npm test` | All Jest tests; live tests only run when `RUN_LIVE_TESTS=true`. |
| `npm run test:live:gemini`, `test:live:claude`, `test:live:failover` | Real provider calls. They cost money and need valid keys. |
| `npm run conformance` | Scenario checks of the AI against the company facts (see [TESTING.md](TESTING.md)). |
| `npm run demo:reset` | Dry-run by default; add `--yes` to execute. Keeps named contacts and deletes the rest. |
| `npm run delivery:simulate -- <digits>` | Insert a fake failed-delivery event; `--clear` removes them. |
| `npx tsx src/query-lead.ts <phone-digits>` | Inspect a lead. |
| `npx tsx src/query-media-captures.ts` | List stored photo and video analyses. |

PowerShell users: use `;` as the command separator, not `&`.

## Repository map

```
src/
  server.ts            startup order, route mounting
  ai/                  router, Gemini/Groq/Claude providers, chain config, startup warnings
  calendar/            IST helpers, slots, Google Calendar client, survey calendar, survey settings
  company/             company facts the AI may state
  conformance/         AI scenario runner
  flows/               qualification, booking, rebooking, rooms, volumetric, quote, team follow-up
  instagram/           parse, client (graph.instagram.com), handler, route
  intake/              IndiaMART push intake
  leads/               schema (db.ts), repository, contacts, enquiry policy, phone handling
  notify/              admin alerts: types, format, dedupe, notifier
  outreach/            consent, 24-hour-window policy, templates, inbound intent handling
  routes/internal.ts   the dashboard's API (X-Internal-Secret)
  storage/             Supabase Storage uploads
  whatsapp/            webhook, client, media, delivery-failure recording
  automation/          follow-up planner, scheduler, messages, API
  lifecycle/           auto-close of finished leads
  integrations/        Instagram token refresh
```

## WhatsApp templates

| Template | Category | Used for |
|---|---|---|
| `admin_alert` | Utility | Team alerts to the admin number. |
| `enquiry_followup` | Marketing | The manual follow-up sent from the dashboard. |
| `survey_reminder` | Utility | Reminder before a booked survey, with Confirm time / Change time buttons. |
| `enquiry_nudge` | Marketing | Automatic nudge after 48 hours of silence (window closed), with Show me times / Not now / Stop messages buttons. |
| `missing_details_prompt` | Marketing | Approved but **not sent automatically**: the in-window prompt goes as free text, which is free. Reserved for future use. |

Meta can reclassify a template's category after review. Confirm the category in WhatsApp Manager before relying on cost assumptions.

## Operations

- **Reset between demos:** `npx tsx src/demo-reset.ts --keep-phone <digits> --keep-ig <username>` prints exactly which leads and contacts would be removed. Add `--yes` to run it in one transaction. Uploaded media files in Storage are not deleted.
- **Re-grant consent after a test STOP:** use the Outreach card on the lead page. A customer's STOP withdraws consent and blocks every automated message to that contact, including reminders.
- **Instagram token:** see Settings in the dashboard. The server refreshes the stored token every `INSTAGRAM_TOKEN_REFRESH_DAYS` days. If you replace `INSTAGRAM_ACCESS_TOKEN` in `.env`, the stored copy is re-seeded automatically on the next run.
- **Logs:** webhook payloads are logged verbatim in development. Tokens, keys and full phone numbers must never be logged; the delivery recorder logs only the last four digits.

## Demo script (10 minutes)

**Audience point to land:** the first reply happens in seconds, every claim the AI makes is checked against company facts, and a human always confirms before a quote is final.

**Before you start (5 minutes ahead)**
1. `npm run test:unit` is green.
2. Express and the dashboard are running; you are signed in.
3. The tunnel is up and the webhook verified. Your phone number is added as a Meta test recipient.
4. `demo:reset` has been run so the dashboard shows only your demo contacts.
5. `FOLLOWUPS_ENABLED=false` unless you intend to show automation, so no stray message arrives mid-demo.
6. A billed Gemini key is configured. The free tier's daily quota can run out mid-demo.
7. Run the conformance scenario for the insurance question (S05) before any prospect session. The model has occasionally affirmed that insurance is offered, which the company facts do not support.

**Walkthrough**

| # | Do | Say / show |
|---|---|---|
| 1 | WhatsApp: "Hi, need quote for moving". | Reply arrives in seconds and asks only for what is missing (cities and size). |
| 2 | Answer with cities, a size and "urgent". | The lead appears in the dashboard inbox with the extracted fields. Ask for a price: the answer is a ballpark range from a lookup table, never an invented figure. |
| 3 | Send one room photo. | Itemised list, cubic feet and weight. Send the **same photo again**: it says nothing was added. |
| 4 | Send a second bedroom, reply "this is the kids bedroom". | Rooms are kept separate; **Get My Move Total** shows grouped rooms. |
| 5 | Tap **Book a Survey**, pick a slot. | Confirmation arrives; the Google Calendar event appears; the team alert fires by WhatsApp and email. |
| 6 | Ask: "do you cover the goods with insurance?" | The bot does not invent coverage; it flags the team and an alert shows on the lead. |
| 7 | Dashboard tour: lead page. | Captures grouped by room with "already counted" lines struck through, Move Estimate, Survey card, Admin alerts, Outreach consent. |
| 8 | Toggle **Human Takeover**, send a message from the dashboard. | The AI stops replying; the human owns the conversation. |
| 9 | Settings: add tomorrow as a holiday, save. | New survey offers skip that day immediately, no restart. Existing bookings are untouched. |
| 10 | Instagram DM "hi" from the test account. | Same brain, second channel. |
| 11 | (If automation is on) show **Automated messages**. | Up next and History, with Cancel; explain consent, STOP, quiet hours and the 24-hour window. |

**Do not claim:** market-size or competitor figures, that Claude is verified in production, any price promise, any GST number, storage or vehicle transport, or that the AI replaces the on-site survey.

## Known limits

1. **Claude production path unverified.** The key currently fails a billing check (HTTP 400, credit balance too low). Text and image chains are verified on Groq and Gemini only.
2. **`claimSlot` re-checks calendar availability, not working hours.** If the admin shrinks the hours after a slot was offered, that customer can still claim it.
3. **A whole-flat video yields one room key** for everything in it.
4. **Item de-duplication is name-based.** Different names for the same object (couch vs sofa) are not matched.
5. **The scheduler is in-process and single-instance.** Restarts are safe (unique claim rows), but running two instances needs a real queue.
6. **`missing_details_prompt` is not sent automatically** (see templates).
7. **The Instagram token is stored in a server-only database table.** A secrets manager is the right home for it in production.
8. **Delivery failures are shown on the lead page only.** No admin message is sent, because the admin number can itself fail and would loop. Only a simulated failure payload has been exercised; the real shape was confirmed from Meta-related documentation.
9. **Free-text reschedule requests** ("Can I reschedule my survey?") are escalated to the team. The Change time button, not the free-text path, re-offers slots.
10. **Automation is WhatsApp-only.** Instagram leads are not nudged.
11. **A customer's STOP also blocks automated booking reminders.**
12. **WhatsApp and Instagram identities are never merged** into one contact.
13. **A failed calendar write is not retried.** The customer gets an honest "we'll confirm" message and the team is alerted.
14. **Demo reset does not delete uploaded media files.**
15. **AI free-tier quotas** (Groq, Gemini) are small; the demo profile assumes you are within them or on a billed key.

## Before going beyond a demo

- Rotate every secret that has appeared in logs or chat and confirm Supabase sign-ups are disabled.
- Move the Instagram token and other secrets to a secrets manager.
- Fund the Anthropic account and run the live Claude checks before enabling it.
- Replace the in-process scheduler with a queue if more than one instance will run.
- Add backups and monitoring on the database, and alerting on `[Followups]`, `[Delivery]` and `[Instagram token]` log lines.
- Review the Meta-approved template categories and costs against the current rate card.
