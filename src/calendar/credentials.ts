/**
 * Google service account credential parsing
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * Parse service account credentials from JSON or base64-encoded JSON
 */
export function parseServiceAccount(text: string): ServiceAccount {
  let json: unknown;

  // Try parsing as raw JSON first
  try {
    json = JSON.parse(text);
  } catch {
    // Try as base64
    try {
      const decoded = Buffer.from(text, "base64").toString("utf-8");
      json = JSON.parse(decoded);
    } catch {
      throw new Error("Invalid service account credentials: not valid JSON or base64");
    }
  }

  if (!json || typeof json !== "object") {
    throw new Error("Invalid service account credentials: not an object");
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.client_email !== "string" || obj.client_email === "") {
    throw new Error("Invalid service account credentials: missing client_email");
  }

  if (typeof obj.private_key !== "string" || obj.private_key === "") {
    throw new Error("Invalid service account credentials: missing private_key");
  }

  return {
    client_email: obj.client_email,
    private_key: obj.private_key,
    token_uri: typeof obj.token_uri === "string" ? obj.token_uri : undefined,
  };
}
