/**
 * Instagram Messenger API client
 */

import { randomUUID } from "node:crypto";

export interface InstagramClientConfig {
  accessToken: string | undefined;
  accountId: string | undefined;
  apiVersion: string;
  dryRun: boolean;
}

export function createInstagramClient(config: InstagramClientConfig) {
  return {
    async sendText(igsid: string, text: string): Promise<{ mid: string | null }> {
      if (config.dryRun) {
        console.log("[Instagram Client] DRY RUN send", { length: text.length });
        return { mid: "dry-" + randomUUID() };
      }

      if (!config.accessToken || !config.accountId) {
        throw new Error("Instagram access token and account ID are required");
      }

      const url = `https://graph.instagram.com/${config.apiVersion}/${config.accountId}/messages`;
      const body = {
        recipient: { id: igsid },
        message: { text },
      };

      console.log("[Instagram Client] Outbound message", { length: text.length });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`Instagram API error: ${response.status} - ${JSON.stringify(data)}`);
      }

      const data = await response.json() as { message_id?: string };
      return { mid: data.message_id ?? null };
    },

    async getProfile(igsid: string): Promise<{ name: string | null; username: string | null } | null> {
      if (config.dryRun || !config.accessToken || !config.accountId) {
        return null;
      }

      const url = `https://graph.instagram.com/${config.apiVersion}/${igsid}?fields=name,username`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
          },
        });

        if (!response.ok) {
          const bodyText = await response.text();
          console.log("[Instagram Client] Profile fetch failed:", {
            status: response.status,
            body: bodyText.substring(0, 200)
          });
          return null;
        }

        const data = await response.json() as { name?: unknown; username?: unknown };
        
        const name = typeof data.name === "string" && data.name.trim() !== "" ? data.name.trim() : null;
        const username = typeof data.username === "string" && data.username.trim() !== "" ? data.username.trim() : null;
        
        if (name === null && username === null) {
          return null;
        }
        
        return { name, username };
      } catch (error) {
        console.log("[Instagram Client] Profile fetch error:", error instanceof Error ? error.message : String(error));
        return null;
      }
    },
  };
}

export function instagramConfigFromEnv(): InstagramClientConfig {
  return {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    accountId: process.env.INSTAGRAM_ACCOUNT_ID,
    apiVersion: process.env.INSTAGRAM_API_VERSION || "v25.0",
    dryRun: process.env.INSTAGRAM_DRY_RUN === "true",
  };
}

let clientInstance: ReturnType<typeof createInstagramClient> | undefined;

export const instagramClient = new Proxy({} as ReturnType<typeof createInstagramClient>, {
  get(_target, prop) {
    if (!clientInstance) {
      clientInstance = createInstagramClient(instagramConfigFromEnv());
    }
    return (clientInstance as any)[prop];
  },
});
