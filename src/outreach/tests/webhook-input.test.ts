/**
 * Tests for webhook input transformation
 */

import { toIntentInput, buttonTapAsText } from "../webhook-input.js";

describe("toIntentInput", () => {
  it("text message with body", () => {
    const result = toIntentInput({ type: "text", text: { body: "STOP" } });
    expect(result.input).toEqual({
      type: "text",
      text: "STOP",
      buttonPayload: null,
      buttonText: null,
    });
    expect(result.rawText).toBe("STOP");
  });

  it("button with payload and text", () => {
    const result = toIntentInput({
      type: "button",
      button: { payload: "enquiry_yes", text: "Yes, continue" },
    });
    expect(result.input).toEqual({
      type: "button",
      text: null,
      buttonPayload: "enquiry_yes",
      buttonText: "Yes, continue",
    });
    expect(result.rawText).toBe("Yes, continue");
  });

  it("button with payload only", () => {
    const result = toIntentInput({
      type: "button",
      button: { payload: "enquiry_not_now" },
    });
    expect(result.input.buttonText).toBe(null);
    expect(result.rawText).toBe("enquiry_not_now");
  });

  it("non-text non-button types", () => {
    const result1 = toIntentInput({ type: "image" });
    expect(result1.input).toEqual({
      type: "image",
      text: null,
      buttonPayload: null,
      buttonText: null,
    });
    expect(result1.rawText).toBe(null);

    const result2 = toIntentInput({ type: "text" });
    expect(result2.input.text).toBe(null);
    expect(result2.rawText).toBe(null);
  });
});

describe("buttonTapAsText", () => {
  it("converts a button tap to text and leaves other messages alone", () => {
    const input = {
      type: "button",
      id: "w1",
      from: "9190",
      button: { payload: "enquiry_yes", text: "Yes, continue" },
    };
    const result = buttonTapAsText(input);

    expect(result.type).toBe("text");
    expect(result.text).toEqual({ body: "Yes, continue" });
    expect((result as any).id).toBe("w1");
    expect((result as any).from).toBe("9190");

    const input2 = { type: "text", text: { body: "hi" } };
    const result2 = buttonTapAsText(input2);
    expect(result2).toBe(input2);
  });

  it("returns same object for button without text", () => {
    const input1 = { type: "button", button: { payload: "enquiry_yes" } };
    const result1 = buttonTapAsText(input1);
    expect(result1).toBe(input1);

    const input2 = { type: "button", button: { text: "   " } };
    const result2 = buttonTapAsText(input2);
    expect(result2).toBe(input2);
  });
});
