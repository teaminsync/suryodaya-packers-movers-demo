/**
 * Instagram webhook simulator
 */

import "dotenv/config";
import { createHmac } from "node:crypto";
import { buildInstagramSample } from "./instagram/sample.js";

const accountId = process.env.INSTAGRAM_ACCOUNT_ID || "17841400000000099";
const secret = process.env.INSTAGRAM_APP_SECRET || "";
const port = process.env.PORT || "3000";

const args = process.argv.slice(2);
const params: {
  from?: string;
  text?: string;
  attachment?: string;
  mid?: string;
  echo?: boolean;
  badSignature?: boolean;
} = {};

for (const arg of args) {
  if (arg.startsWith("--from=")) {
    params.from = arg.slice(7);
  } else if (arg.startsWith("--text=")) {
    params.text = arg.slice(7);
  } else if (arg.startsWith("--attachment=")) {
    params.attachment = arg.slice(13);
  } else if (arg.startsWith("--mid=")) {
    params.mid = arg.slice(6);
  } else if (arg === "--echo") {
    params.echo = true;
  } else if (arg === "--bad-signature") {
    params.badSignature = true;
  }
}

const payload = buildInstagramSample({
  igsid: params.from,
  accountId,
  mid: params.mid,
  text: params.text !== undefined ? params.text : params.attachment ? null : "Hi",
  attachmentType: params.attachment || null,
  echo: params.echo,
});

const payloadStr = JSON.stringify(payload);

const signKey = params.badSignature ? "wrong" : secret;
const signature = "sha256=" + createHmac("sha256", signKey).update(payloadStr).digest("hex");

const url = `http://localhost:${port}/webhook/instagram`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-hub-signature-256": signature,
  },
  body: payloadStr,
});

console.log("Status:", response.status);
console.log("MID:", (payload.entry as any)?.[0]?.messaging?.[0]?.message?.mid);
