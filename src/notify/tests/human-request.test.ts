/**
 * Tests for human request pattern matching
 */

import { looksLikeHumanRequest } from "../human-request.js";

describe("looksLikeHumanRequest", () => {
  it("matches I need to talk to a human", () => {
    expect(looksLikeHumanRequest("I need to talk to a human")).toBe(true);
  });

  it("matches connect me to a human", () => {
    expect(looksLikeHumanRequest("connect me to a human")).toBe(true);
  });

  it("matches Can I speak to someone from your team?", () => {
    expect(looksLikeHumanRequest("Can I speak to someone from your team?")).toBe(true);
  });

  it("matches please connect me with the owner", () => {
    expect(looksLikeHumanRequest("please connect me with the owner")).toBe(true);
  });

  it("matches talk to a real person", () => {
    expect(looksLikeHumanRequest("talk to a real person")).toBe(true);
  });

  it("matches I want a human agent", () => {
    expect(looksLikeHumanRequest("I want a human agent")).toBe(true);
  });

  it("matches customer care number please", () => {
    expect(looksLikeHumanRequest("customer care number please")).toBe(true);
  });

  it("matches call me please", () => {
    expect(looksLikeHumanRequest("call me please")).toBe(true);
  });

  it("matches mujhe insaan se baat karni hai", () => {
    expect(looksLikeHumanRequest("mujhe insaan se baat karni hai")).toBe(true);
  });

  it("matches owner se baat karao", () => {
    expect(looksLikeHumanRequest("owner se baat karao")).toBe(true);
  });

  it("matches human se baat karni hai", () => {
    expect(looksLikeHumanRequest("human se baat karni hai")).toBe(true);
  });

  it("matches kisi se baat karwao", () => {
    expect(looksLikeHumanRequest("kisi se baat karwao")).toBe(true);
  });

  it("matches I want to talk to your team about insurance", () => {
    expect(looksLikeHumanRequest("I want to talk to your team about insurance")).toBe(true);
  });

  it("matches TALK TO A HUMAN!!", () => {
    expect(looksLikeHumanRequest("TALK TO A HUMAN!!")).toBe(true);
  });

  it("rejects I will talk to my wife first", () => {
    expect(looksLikeHumanRequest("I will talk to my wife first")).toBe(false);
  });

  it("rejects my human resources team is moving", () => {
    expect(looksLikeHumanRequest("my human resources team is moving")).toBe(false);
  });

  it("rejects don't call me after 9", () => {
    expect(looksLikeHumanRequest("don't call me after 9")).toBe(false);
  });

  it("rejects stop calling me", () => {
    expect(looksLikeHumanRequest("stop calling me")).toBe(false);
  });

  it("rejects the team is 5 people", () => {
    expect(looksLikeHumanRequest("the team is 5 people")).toBe(false);
  });

  it("rejects Do you have a team for packing?", () => {
    expect(looksLikeHumanRequest("Do you have a team for packing?")).toBe(false);
  });

  it("rejects I need a quote", () => {
    expect(looksLikeHumanRequest("I need a quote")).toBe(false);
  });

  it("rejects hi", () => {
    expect(looksLikeHumanRequest("hi")).toBe(false);
  });

  it("rejects we are a team of 5, need 3bhk shifting", () => {
    expect(looksLikeHumanRequest("we are a team of 5, need 3bhk shifting")).toBe(false);
  });

  it("rejects forward the quote to the team", () => {
    expect(looksLikeHumanRequest("forward the quote to the team")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(looksLikeHumanRequest("")).toBe(false);
  });

  it("rejects 500 character string of letter a", () => {
    expect(looksLikeHumanRequest("a".repeat(500))).toBe(false);
  });
});
