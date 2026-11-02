/**
 * Tests for delivery failure extraction
 */

import { describe, it, expect } from "@jest/globals";
import { extractFailedDeliveries } from "../delivery.js";

describe("extractFailedDeliveries", () => {
  it("extracts real Meta failed delivery shape", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123456789",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15551234567",
                  phone_number_id: "987654321",
                },
                statuses: [
                  {
                    id: "wamid.HBgNMTIzNDU2Nzg5MDEVAAA=",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [
                      {
                        code: 131047,
                        title: "Re-engagement message",
                        message: "Re-engagement message",
                        error_data: {
                          details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number.",
                        },
                        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
                      },
                    ],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result).toHaveLength(1);
    expect(result[0].wamid).toBe("wamid.HBgNMTIzNDU2Nzg5MDEVAAA=");
    expect(result[0].recipient).toBe("919876543210");
    expect(result[0].code).toBe("131047");
    expect(result[0].title).toBe("Re-engagement message");
    expect(result[0].detail).toContain("Message failed to send because more than 24 hours");
    expect(result[0].failedAt).toBeInstanceOf(Date);
    expect(result[0].failedAt?.getTime()).toBe(1698765432000);
  });

  it("returns only failed statuses from mixed payload", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  { id: "wamid.sent", status: "sent", timestamp: "1698765430", recipient_id: "919876543210" },
                  { id: "wamid.delivered", status: "delivered", timestamp: "1698765431", recipient_id: "919876543210" },
                  {
                    id: "wamid.failed",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543211",
                    errors: [{ code: 131047, title: "Re-engagement message" }],
                  },
                  { id: "wamid.read", status: "read", timestamp: "1698765433", recipient_id: "919876543210" },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result).toHaveLength(1);
    expect(result[0].wamid).toBe("wamid.failed");
    expect(result[0].recipient).toBe("919876543211");
  });

  it("extracts multiple failed deliveries", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.failed1",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047 }],
                  },
                  {
                    id: "wamid.failed2",
                    status: "failed",
                    timestamp: "1698765433",
                    recipient_id: "919876543211",
                    errors: [{ code: 131051 }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result).toHaveLength(2);
    expect(result[0].wamid).toBe("wamid.failed1");
    expect(result[1].wamid).toBe("wamid.failed2");
  });

  it("returns unknown code when errors absent", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.noerrorcodes",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("unknown");
    expect(result[0].title).toBeNull();
    expect(result[0].detail).toBeNull();
  });

  it("parses timestamp as number", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.numts",
                    status: "failed",
                    timestamp: 1698765432,
                    recipient_id: "919876543210",
                    errors: [{ code: 131047 }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].failedAt).toBeInstanceOf(Date);
    expect(result[0].failedAt?.getTime()).toBe(1698765432000);
  });

  it("parses timestamp as string", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.strts",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047 }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].failedAt).toBeInstanceOf(Date);
    expect(result[0].failedAt?.getTime()).toBe(1698765432000);
  });

  it("truncates title to 200 characters", () => {
    const longTitle = "a".repeat(250);
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.long",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047, title: longTitle }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].title?.length).toBe(200);
  });

  it("truncates detail to 300 characters", () => {
    const longDetail = "b".repeat(350);
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.longdetail",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047, error_data: { details: longDetail } }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].detail?.length).toBe(300);
  });

  it("skips when id is missing", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047 }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result).toHaveLength(0);
  });

  it("returns empty array for null", () => {
    const result = extractFailedDeliveries(null);
    expect(result).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    const result = extractFailedDeliveries(undefined);
    expect(result).toEqual([]);
  });

  it("returns empty array for string", () => {
    const result = extractFailedDeliveries("not an object");
    expect(result).toEqual([]);
  });

  it("returns empty array for array", () => {
    const result = extractFailedDeliveries([1, 2, 3]);
    expect(result).toEqual([]);
  });

  it("returns empty array for entry without changes", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "123" }],
    };

    const result = extractFailedDeliveries(payload);
    expect(result).toEqual([]);
  });

  it("uses error message as fallback for detail when error_data missing", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.msgfallback",
                    status: "failed",
                    timestamp: "1698765432",
                    recipient_id: "919876543210",
                    errors: [{ code: 131047, message: "Fallback message" }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].detail).toBe("Fallback message");
  });

  it("handles empty recipient_id as empty string", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "15551234567", phone_number_id: "987" },
                statuses: [
                  {
                    id: "wamid.norecipient",
                    status: "failed",
                    timestamp: "1698765432",
                    errors: [{ code: 131047 }],
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const result = extractFailedDeliveries(payload);

    expect(result[0].recipient).toBe("");
  });
});
