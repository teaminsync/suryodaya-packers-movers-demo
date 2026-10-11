/**
 * Meta webhook signature verification
 */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Meta's X-Hub-Signature-256 header
 * @param rawBody The raw request body buffer
 * @param signatureHeader The X-Hub-Signature-256 header value
 * @param appSecret The Meta app secret
 * @returns true if signature is valid, false otherwise
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  try {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }

    const providedHex = signatureHeader.slice(7);

    if (!/^[0-9a-f]{64}$/i.test(providedHex)) {
      return false;
    }

    const expected = createHmac("sha256", appSecret)
      .update(rawBody)
      .digest();

    return timingSafeEqual(Buffer.from(providedHex, "hex"), expected);
  } catch {
    return false;
  }
}
