import "dotenv/config";
import { sql } from "./leads/db.js";
import { outreachDeps } from "./outreach/service-db.js";
import { getOutreachStatus, sendFollowup, recordStaffConsent } from "./outreach/service.js";

async function main() {
  try {
    const args = process.argv.slice(2);

    const options: Record<string, string> = {};
    let command: string | null = null;

    for (const arg of args) {
      if (arg.startsWith("--")) {
        const [key, value] = arg.slice(2).split("=", 2);
        if (value) {
          options[key] = value;
        }
      } else if (!command) {
        command = arg;
      }
    }

    if (!command || !["status", "consent", "followup"].includes(command)) {
      console.log("Usage: npx tsx src/outreach-demo.ts <status|consent|followup> --lead=<id> [--note=<text>]");
      process.exitCode = 1;
      return;
    }

    if (!options.lead) {
      console.log("Usage: npx tsx src/outreach-demo.ts <status|consent|followup> --lead=<id> [--note=<text>]");
      process.exitCode = 1;
      return;
    }

    const now = new Date();

    if (command === "status") {
      const result = await getOutreachStatus(options.lead, now, outreachDeps);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === "consent") {
      if (!options.note) {
        console.log("Usage: npx tsx src/outreach-demo.ts consent --lead=<id> --note=<text>");
        process.exitCode = 1;
        return;
      }
      const result = await recordStaffConsent(options.lead, options.note, now, outreachDeps);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    } else if (command === "followup") {
      const result = await sendFollowup(options.lead, now, outreachDeps);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) {
        process.exitCode = 1;
      }
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
