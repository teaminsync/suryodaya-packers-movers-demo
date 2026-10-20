/**
 * Tests for Instagram webhook verification
 */

import { createHmac } from "node:crypto";
import { verifySubscription, verifyInstagramSignature } from "../verify.js";

describe("verifySubscription", () => {
  it("returns ok and challenge for valid subscribe query", () => {
    const query = {
      "hub.mode": "subscribe",
      "hub.verify_token": "my-token",
      "hub.challenge": "12345",
    };

    const result = verifySubscription(query, "my-token");

    expect(result).toEqual({ ok: true, challenge: "12345" });
  });

  it("returns false for wrong token wrong mode and missing challenge", () => {
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" }, "my-token")).toEqual({ ok: false });
    expect(verifySubscription({ "hub.mode": "unsubscribe", "hub.verify_token": "my-token", "hub.challenge": "x" }, "my-token")).toEqual({ ok: false });
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "my-token" }, "my-token")).toEqual({ ok: false });
  });

  it("returns false when expectedToken is undefined or empty", () => {
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": undefined, "hub.challenge": "x" }, undefined)).toEqual({ ok: false });
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "x" }, "")).toEqual({ ok: false });
  });
});

describe("verifyInstagramSignature", () => {
  it("verifies valid signature", () => {
    const body = "test payload";
    const secret = "my-secret";
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyInstagramSignature(body, signature, [secret])).toBe(true);
  });

  it("returns false for wrong secret tampered body missing header and header without prefix", () => {
    const body = "test payload";
    const secret = "my-secret";
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyInstagramSignature(body, signature, ["wrong-secret"])).toBe(false);
    expect(verifyInstagramSignature("tampered", signature, [secret])).toBe(false);
    expect(verifyInstagramSignature(body, undefined, [secret])).toBe(false);
    expect(verifyInstagramSignature(body, "abc123", [secret])).toBe(false);
  });

  it("returns true when second secret matches and ignores undefined and empty secrets", () => {
    const body = "test payload";
    const secret = "my-secret";
    const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyInstagramSignature(body, signature, ["wrong", secret])).toBe(true);
    expect(verifyInstagramSignature(body, signature, [undefined, "", secret])).toBe(true);
    expect(verifyInstagramSignature(body, signature, [undefined, ""])).toBe(false);
  });

  it("verifies Buffer and string body and returns false for undefined body", () => {
    const bodyStr = "test payload";
    const bodyBuf = Buffer.from(bodyStr);
    const secret = "my-secret";
    const signature = "sha256=" + createHmac("sha256", secret).update(bodyStr).digest("hex");

    expect(verifyInstagramSignature(bodyStr, signature, [secret])).toBe(true);
    expect(verifyInstagramSignature(bodyBuf, signature, [secret])).toBe(true);
    expect(verifyInstagramSignature(undefined, signature, [secret])).toBe(false);
  });
});
