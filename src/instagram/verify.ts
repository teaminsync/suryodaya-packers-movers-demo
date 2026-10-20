/**
 * Instagram webhook verification
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySubscription(
  query: Record<string, unknown>,
  expectedToken: string | undefined
): { ok: true; challenge: string } | { ok: false } {
  if (typeof expectedToken !== "string" || expectedToken === "") {
    return { ok: false };
  }

  if (query["hub.mode"] !== "subscribe") {
    return { ok: false };
  }

  const token = query["hub.verify_token"];
  if (typeof token !== "string") {
    return { ok: false };
  }

  const expectedBuf = Buffer.from(expectedToken, "utf8");
  const tokenBuf = Buffer.from(token, "utf8");

  if (expectedBuf.length !== tokenBuf.length || !timingSafeEqual(expectedBuf, tokenBuf)) {
    return { ok: false };
  }

  const challenge = query["hub.challenge"];
  if (typeof challenge !== "string" || challenge === "") {
    return { ok: false };
  }

  return { ok: true, challenge };
}

export function verifyInstagramSignature(
  rawBody: Buffer | string | undefined,
  header: string | undefined,
  secrets: Array<string | undefined>
): boolean {
  if (rawBody === undefined) {
    return false;
  }

  if (typeof header !== "string" || !header.startsWith("sha256=")) {
    return false;
  }

  const providedHex = header.slice(7).toLowerCase();

  const validSecrets = secrets.filter((s): s is string => typeof s === "string" && s !== "");

  if (validSecrets.length === 0) {
    return false;
  }

  const bodyBuf = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

  for (const secret of validSecrets) {
    const expected = createHmac("sha256", secret).update(bodyBuf).digest("hex").toLowerCase();

    if (expected.length === providedHex.length) {
      try {
        if (timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(providedHex, "hex"))) {
          return true;
        }
      } catch {
        // Continue to next secret
      }
    }
  }

  return false;
}
