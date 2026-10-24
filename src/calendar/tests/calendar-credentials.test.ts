import { describe, it, expect } from "@jest/globals";
import { parseServiceAccount } from "../credentials.js";

describe("Calendar credentials", () => {
  it("parses valid raw JSON", () => {
    const json = JSON.stringify({
      client_email: "test@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    });
    const account = parseServiceAccount(json);
    expect(account.client_email).toBe("test@example.com");
    expect(account.private_key).toBe("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
  });

  it("parses valid base64 of JSON", () => {
    const json = JSON.stringify({
      client_email: "test@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    });
    const base64 = Buffer.from(json).toString("base64");
    const account = parseServiceAccount(base64);
    expect(account.client_email).toBe("test@example.com");
    expect(account.private_key).toBe("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
  });

  it("throws on missing client_email", () => {
    const json = JSON.stringify({
      private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    });
    expect(() => parseServiceAccount(json)).toThrow("Invalid service account credentials: missing client_email");
  });

  it("throws on missing private_key", () => {
    const json = JSON.stringify({
      client_email: "test@example.com",
    });
    expect(() => parseServiceAccount(json)).toThrow("Invalid service account credentials: missing private_key");
  });

  it("throws on garbage text", () => {
    expect(() => parseServiceAccount("not json")).toThrow("Invalid service account credentials:");
  });

  it("every failure message starts with prefix and does not contain input", () => {
    const inputs = [
      "not json at all",
      JSON.stringify({ client_email: "", private_key: "key" }),
      JSON.stringify({ client_email: "test@example.com" }),
      Buffer.from("malformed").toString("base64"),
    ];

    for (const input of inputs) {
      try {
        parseServiceAccount(input);
        expect(true).toBe(false); // should have thrown
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg.startsWith("Invalid service account credentials:")).toBe(true);
        expect(msg.includes(input)).toBe(false);
      }
    }
  });
});
