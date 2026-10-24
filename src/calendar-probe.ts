#!/usr/bin/env tsx
/**
 * Calendar probe script for checking Google sign-in and survey slots
 * Commands: check | insert-test
 */

import "dotenv/config";
import * as fs from "fs";
import { parseSurveyConfig } from "./calendar/config.js";
import { parseServiceAccount } from "./calendar/credentials.js";
import { createGoogleAuth } from "./calendar/google-auth.js";
import { createCalendarClient } from "./calendar/google-client.js";
import { generateCandidateSlots, filterAvailable, pickSlotOptions, toOffer, formatSlotLabel } from "./calendar/slots.js";
import type { ServiceAccount } from "./calendar/credentials.js";

async function main() {
  const command = process.argv[2];
  if (!command || !["check", "insert-test"].includes(command)) {
    console.error("Usage: tsx src/calendar-probe.ts <check|insert-test>");
    process.exit(1);
  }

  try {
    // Parse config
    const { config, warnings } = parseSurveyConfig(process.env);
    warnings.forEach((w) => console.log(w));

    // Parse service account
    let account: ServiceAccount;
    const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (keyFilePath) {
      const keyContent = fs.readFileSync(keyFilePath, "utf-8");
      account = parseServiceAccount(keyContent);
    } else if (keyJson) {
      account = parseServiceAccount(keyJson);
    } else {
      throw new Error("No service account credentials found");
    }

    console.log(`service account: ${account.client_email}`);

    // Get access token
    const auth = createGoogleAuth({
      account,
      fetchFn: fetch,
      now: () => new Date(),
    });
    await auth.getAccessToken();
    console.log("token: ok");

    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      throw new Error("GOOGLE_CALENDAR_ID not set");
    }

    // Create calendar client
    const client = createCalendarClient({
      calendarId,
      getAccessToken: auth.getAccessToken.bind(auth),
      fetchFn: fetch,
    });

    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Get busy intervals
    const busy = await client.freeBusy(now, twoWeeksLater);
    console.log(`${busy.length} busy interval${busy.length !== 1 ? "s" : ""}`);
    busy.forEach((b) => {
      const startLabel = formatSlotLabel(b.start);
      const endLabel = formatSlotLabel(b.end);
      console.log(`${startLabel} - ${endLabel}`);
    });

    // Generate and filter slots
    const candidates = generateCandidateSlots(now, config);
    const available = filterAvailable(candidates, busy, config);
    const options = pickSlotOptions(available);
    const offered = options.map(toOffer);

    console.log(`${offered.length} offered slot${offered.length !== 1 ? "s" : ""}`);
    offered.forEach((slot, i) => {
      console.log(`${i + 1}. ${slot.label}`);
    });

    if (command === "insert-test") {
      if (offered.length === 0) {
        throw new Error("No slots available to insert");
      }

      const firstSlot = offered[0];
      const slotStart = new Date(firstSlot.datetime);
      const slotEnd = new Date(slotStart.getTime() + config.durationMinutes * 60 * 1000);

      const result = await client.insertEvent({
        summary: "TEST - Suryodaya probe (safe to delete)",
        description: "Created by src/calendar-probe.ts",
        location: null,
        start: slotStart,
        end: slotEnd,
        leadId: "probe",
      });

      console.log(`inserted event id: ${result.id}`);
      if (result.htmlLink) {
        console.log(`link: ${result.htmlLink}`);
      }
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

main();
