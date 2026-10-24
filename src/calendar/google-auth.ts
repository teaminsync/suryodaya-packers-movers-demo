/**
 * Google OAuth2 authentication using service account JWT
 */

import * as crypto from "crypto";
import type { ServiceAccount } from "./credentials.js";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface AuthDeps {
  account: ServiceAccount;
  fetchFn: typeof fetch;
  now(): Date;
  scope?: string;
}

function base64url(data: Buffer): string {
  return data
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function createJWT(
  account: ServiceAccount,
  scope: string,
  iat: number
): string {
  const header = { alg: "RSA-SHA256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope,
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const claimsB64 = base64url(Buffer.from(JSON.stringify(claims)));
  const data = `${headerB64}.${claimsB64}`;

  const signature = crypto.sign("RSA-SHA256", Buffer.from(data), account.private_key);
  const signatureB64 = base64url(signature);

  return `${data}.${signatureB64}`;
}

export function createGoogleAuth(deps: AuthDeps): { getAccessToken(): Promise<string> } {
  const scope = deps.scope || "https://www.googleapis.com/auth/calendar";
  let cachedToken: string | null = null;
  let expiresAt = 0;

  async function getAccessToken(): Promise<string> {
    const nowSec = Math.floor(deps.now().getTime() / 1000);

    // Use cached token if still valid (with 60s buffer)
    if (cachedToken && nowSec <= expiresAt - 60) {
      return cachedToken;
    }

    // Create JWT
    const jwt = createJWT(deps.account, scope, nowSec);

    // Request token
    const tokenUrl = deps.account.token_uri || "https://oauth2.googleapis.com/token";
    const body = `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`;

    const response = await deps.fetchFn(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      const preview = text.slice(0, 200);
      throw new Error(`Google token HTTP ${response.status}: ${preview}`);
    }

    const json = (await response.json()) as TokenResponse;
    cachedToken = json.access_token;
    expiresAt = nowSec + json.expires_in;

    return cachedToken;
  }

  return { getAccessToken };
}
