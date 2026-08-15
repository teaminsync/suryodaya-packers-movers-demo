/**
 * Minimal types for WhatsApp Cloud API webhook payloads
 */

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          interactive?: {
            type: string;
            list_reply?: {
              id: string;
              title: string;
              description?: string;
            };
            button_reply?: {
              id: string;
              title: string;
            };
          };
          image?: {
            id: string;
            mime_type: string;
            sha256: string;
            url: string;
            caption?: string;
          };
          video?: {
            id: string;
            mime_type: string;
            sha256: string;
            url: string;
            caption?: string;
          };
          type: string;
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}
