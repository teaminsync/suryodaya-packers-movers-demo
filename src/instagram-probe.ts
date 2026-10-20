/**
 * Instagram API probe tool
 * Run with: npx tsx src/instagram-probe.ts <command>
 */

import "dotenv/config";

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
const apiVersion = process.env.INSTAGRAM_API_VERSION || "v25.0";

if (!accessToken || !accountId) {
  console.error("Error: INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID must be set");
  process.exit(1);
}

const command = process.argv[2];

async function callApi(path: string, method = "GET", body?: unknown) {
  const url = `https://graph.instagram.com/${apiVersion}/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error(`HTTP ${response.status}`);
    if (data && typeof data === "object" && "error" in data) {
      console.error(JSON.stringify(data.error, null, 2));
    }
    process.exit(1);
  }

  return response.json();
}

async function me() {
  const data = await callApi("me?fields=user_id,username,account_type");
  console.log(JSON.stringify(data, null, 2));
}

async function conversations() {
  const data = await callApi(`${accountId}/conversations?platform=instagram&fields=id,updated_time,participants`) as any;

  if (Array.isArray(data.data)) {
    for (const conv of data.data) {
      console.log(`\nConversation: ${conv.id}`);
      console.log(`Updated: ${conv.updated_time}`);
      if (conv.participants?.data) {
        console.log(`Participants: ${conv.participants.data.map((p: any) => `${p.username || p.id}`).join(", ")}`);
      }
    }

    const firstThree = data.data.slice(0, 3);
    for (const conv of firstThree) {
      console.log(`\n--- Messages for ${conv.id} ---`);
      const messages = await callApi(`${conv.id}?fields=messages.limit(5){id,created_time,from,to,message}`) as any;
      
      if (messages.messages?.data) {
        for (const msg of messages.messages.data) {
          const from = msg.from?.username || msg.from?.id || "unknown";
          const text = msg.message ? msg.message.substring(0, 80) : "[no text]";
          console.log(`${msg.created_time} | ${from}: ${text}`);
        }
      }
    }
  }
}

async function send() {
  const args = process.argv.slice(3);
  const toArg = args.find((a) => a.startsWith("--to="));
  const textArg = args.find((a) => a.startsWith("--text="));
  const yes = args.includes("--yes");

  if (!toArg || !textArg) {
    console.error("Usage: send --to=<igsid> --text=<text> --yes");
    process.exit(1);
  }

  const to = toArg.split("=")[1];
  const text = textArg.split("=")[1];

  if (!yes) {
    console.log("Add --yes to really send");
    process.exit(0);
  }

  const data = await callApi(`${accountId}/messages`, "POST", {
    recipient: { id: to },
    message: { text },
  });

  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case "me":
    await me();
    break;
  case "conversations":
    await conversations();
    break;
  case "send":
    await send();
    break;
  default:
    console.error("Unknown command. Available: me, conversations, send");
    process.exit(1);
}
