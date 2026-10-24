import { describe, it, expect, jest } from "@jest/globals";
import { createGoogleAuth } from "../google-auth.js";
import * as crypto from "crypto";

describe("Calendar auth", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const account = {
    client_email: "test@example.com",
    private_key: privateKey,
  };

  it("requests token from correct URL with correct method and headers", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    const mockFetch: typeof fetch = async (url, options) => {
      capturedUrl = url as string;
      capturedMethod = options?.method || "GET";
      capturedHeaders = options?.headers as Record<string, string>;
      capturedBody = options?.body as string;

      return {
        ok: true,
        json: async () => ({ access_token: "fake-token", expires_in: 3600 }),
      } as Response;
    };

    const auth = createGoogleAuth({
      account,
      fetchFn: mockFetch,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
    });

    await auth.getAccessToken();

    expect(capturedUrl).toBe("https://oauth2.googleapis.com/token");
    expect(capturedMethod).toBe("POST");
    expect(capturedHeaders["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(capturedBody).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(capturedBody).toContain("assertion=");
  });

  it("JWT has three parts and correct structure", async () => {
    let capturedJWT = "";

    const mockFetch: typeof fetch = async (_url, options) => {
      const body = options?.body as string;
      const match = body.match(/assertion=([^&]+)/);
      if (match) {
        capturedJWT = decodeURIComponent(match[1]);
      }

      return {
        ok: true,
        json: async () => ({ access_token: "fake-token", expires_in: 3600 }),
      } as Response;
    };

    const auth = createGoogleAuth({
      account,
      fetchFn: mockFetch,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
    });

    await auth.getAccessToken();

    const parts = capturedJWT.split(".");
    expect(parts.length).toBe(3);

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");

    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(claims.iss).toBe("test@example.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/calendar");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.exp - claims.iat).toBe(3600);

    const signature = Buffer.from(parts[2], "base64url");
    const data = `${parts[0]}.${parts[1]}`;
    const verified = crypto.verify("RSA-SHA256", Buffer.from(data), publicKey, signature);
    expect(verified).toBe(true);
  });

  it("caches token and reuses it within expiry window", async () => {
    let callCount = 0;
    let currentTime = new Date("2026-10-20T10:00:00.000Z");

    const mockFetch: typeof fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ access_token: `token-${callCount}`, expires_in: 3600 }),
      } as Response;
    };

    const auth = createGoogleAuth({
      account,
      fetchFn: mockFetch,
      now: () => currentTime,
    });

    // First call at 10:00:00
    const token1 = await auth.getAccessToken();
    expect(callCount).toBe(1);
    expect(token1).toBe("token-1");

    // Second call at 10:58:00 (58 minutes later, still strictly before expiry-60)
    currentTime = new Date("2026-10-20T10:58:00.000Z");
    const token2 = await auth.getAccessToken();
    expect(callCount).toBe(1);
    expect(token2).toBe(token1);

    // Third call at 10:59:00 exactly (59 minutes = expiry-60, NOT strictly before, so new request)
    currentTime = new Date("2026-10-20T10:59:00.000Z");
    const token3 = await auth.getAccessToken();
    expect(callCount).toBe(2);
    expect(token3).toBe("token-2");

    // Fourth call at 10:59:30 after refresh at 10:59:00 (reuses new token)
    currentTime = new Date("2026-10-20T10:59:30.000Z");
    const token4 = await auth.getAccessToken();
    expect(callCount).toBe(2);
    expect(token4).toBe("token-2");
  });

  it("throws on 401 response and does not include private key in message", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response;
    };

    const auth = createGoogleAuth({
      account,
      fetchFn: mockFetch,
      now: () => new Date("2026-10-20T10:00:00.000Z"),
    });

    try {
      await auth.getAccessToken();
      expect(true).toBe(false); // should have thrown
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain("Google token HTTP 401");
      expect(msg.includes(privateKey)).toBe(false);
    }
  });
});
