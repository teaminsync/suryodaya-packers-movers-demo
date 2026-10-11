/**
 * Tests for Meta webhook signature verification
 */

import { createHmac } from "crypto";
import { verifyMetaSignature } from "../signature.js";

describe("Meta webhook signature verification", () => {
  const testSecret = "test-secret";

  it("valid signature", () => {
    const body = Buffer.from("{\"a\":\"\u20B9\"}", "utf8");
    const header = "sha256=" + createHmac("sha256", testSecret).update(body).digest("hex");
    
    expect(verifyMetaSignature(body, header, testSecret)).toBe(true);
  });

  it("wrong secret", () => {
    const body = Buffer.from("{\"a\":\"\u20B9\"}", "utf8");
    const header = "sha256=" + createHmac("sha256", testSecret).update(body).digest("hex");
    
    expect(verifyMetaSignature(body, header, "other-secret")).toBe(false);
  });

  it("tampered body", () => {
    const originalBody = Buffer.from("{\"a\":\"\u20B9\"}", "utf8");
    const header = "sha256=" + createHmac("sha256", testSecret).update(originalBody).digest("hex");
    const tamperedBody = Buffer.from("{\"a\":\"\u20B8\"}", "utf8");
    
    expect(verifyMetaSignature(tamperedBody, header, testSecret)).toBe(false);
  });

  it("malformed headers all return false", () => {
    const body = Buffer.from("{\"a\":\"\u20B9\"}", "utf8");
    
    expect(verifyMetaSignature(body, undefined, testSecret)).toBe(false);
    expect(verifyMetaSignature(body, "abc", testSecret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", testSecret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=" + "0".repeat(64), testSecret)).toBe(false);
  });
});
