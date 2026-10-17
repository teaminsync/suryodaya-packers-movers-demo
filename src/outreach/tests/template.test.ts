/**
 * Tests for message templates
 */

import { renderFollowupTemplateText, buildTemplateRequestBody, classifyInboundIntent } from "../messages.js";

describe("Template rendering and building", () => {
  it("renders followup template text", () => {
    const result = renderFollowupTemplateText(["Devansh", "Pune to Mumbai"]);
    expect(result).toBe(
      "Hi Devansh, this is Suryodaya Packers & Movers following up on your moving enquiry (Pune to Mumbai). Would you like to continue on WhatsApp? We can share a ballpark estimate and free survey times right here."
    );
  });

  it("builds template request body with params and buttons", () => {
    const result = buildTemplateRequestBody({
      to: "919082210545",
      templateName: "enquiry_followup",
      languageCode: "en",
      bodyParams: ["Devansh", "Pune to Mumbai"],
      buttonPayloads: ["enquiry_yes", "enquiry_not_now"],
    });

    expect(result).toEqual({
      messaging_product: "whatsapp",
      to: "919082210545",
      type: "template",
      template: {
        name: "enquiry_followup",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Devansh" },
              { type: "text", text: "Pune to Mumbai" },
            ],
          },
          {
            type: "button",
            sub_type: "quick_reply",
            index: "0",
            parameters: [{ type: "payload", payload: "enquiry_yes" }],
          },
          {
            type: "button",
            sub_type: "quick_reply",
            index: "1",
            parameters: [{ type: "payload", payload: "enquiry_not_now" }],
          },
        ],
      },
    });
  });

  it("builds template request body with no components", () => {
    const result = buildTemplateRequestBody({
      to: "919082210545",
      templateName: "test_template",
      languageCode: "en",
      bodyParams: [],
    });

    expect(Object.prototype.hasOwnProperty.call(result.template, "components")).toBe(false);
  });

  it("classifies button intent correctly", () => {
    const result1 = classifyInboundIntent({
      type: "button",
      buttonPayload: "Yes, continue",
      buttonText: "Yes, continue",
    });
    expect(result1.kind).toBe("followup_yes");

    const result2 = classifyInboundIntent({
      type: "button",
      buttonPayload: "enquiry_not_now",
      buttonText: "Yes, continue",
    });
    expect(result2.kind).toBe("followup_not_now");

    const result3 = classifyInboundIntent({
      type: "button",
      buttonPayload: "other",
      buttonText: "Maybe",
    });
    expect(result3.kind).toBe("none");
  });
});
