/**
 * WhatsApp Cloud API client for sending messages
 */

import { WhatsAppSendMessageResponse } from "./types.js";

const GRAPH_API_BASE = "https://graph.facebook.com";

export class WhatsAppClient {
  private readonly apiVersion: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor() {
    this.apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

    if (!this.phoneNumberId) {
      throw new Error("WHATSAPP_PHONE_NUMBER_ID is required");
    }
    if (!this.accessToken) {
      throw new Error("WHATSAPP_ACCESS_TOKEN is required");
    }
  }

  /**
   * Send a text message via WhatsApp Cloud API
   */
  async sendMessage(
    to: string,
    text: string
  ): Promise<WhatsAppSendMessageResponse> {
    const url = `${GRAPH_API_BASE}/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        body: text,
      },
    };

    // Log outbound request (minus token)
    console.log("[WhatsApp Client] Outbound request:", {
      url,
      to,
      textLength: text.length,
      textPreview: text.substring(0, 100),
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as WhatsAppSendMessageResponse | { error: unknown };

      // Log full raw response
      console.log("[WhatsApp Client] Raw response:", JSON.stringify(data, null, 2));

      if (!response.ok) {
        throw new Error(
          `WhatsApp API error: ${response.status} - ${JSON.stringify(data)}`
        );
      }

      return data as WhatsAppSendMessageResponse;
    } catch (error) {
      console.error("[WhatsApp Client] Send failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const whatsappClient = new WhatsAppClient();
