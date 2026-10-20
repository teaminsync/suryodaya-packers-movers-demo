import { evaluateSlotReply } from "../slot-reply.js";
import type { SlotChoice } from "../slot-reply.js";

describe("evaluateSlotReply", () => {
  const now = new Date("2026-10-19T08:00:00.000Z");
  const slots: SlotChoice[] = [
    { label: "Tue, 20 Oct at 10:00 AM", datetime: "2026-10-20T04:30:00.000Z" },
    { label: "Tue, 20 Oct at 2:00 PM", datetime: "2026-10-20T08:30:00.000Z" },
    { label: "Wed, 21 Oct at 10:00 AM", datetime: "2026-10-21T04:30:00.000Z" },
  ];

  it("bare numbers 1 2 3 select the correct index", () => {
    expect(evaluateSlotReply({ text: "1", slots, now })).toEqual({ kind: "select", index: 0 });
    expect(evaluateSlotReply({ text: "2", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "3", slots, now })).toEqual({ kind: "select", index: 2 });
  });

  it("number forms with prefixes and suffixes", () => {
    expect(evaluateSlotReply({ text: "2.", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "2)", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "Option 2", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "slot 3", slots, now })).toEqual({ kind: "select", index: 2 });
    expect(evaluateSlotReply({ text: "#1", slots, now })).toEqual({ kind: "select", index: 0 });
    expect(evaluateSlotReply({ text: "  2  ", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "No. 2", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "no 2!", slots, now })).toEqual({ kind: "select", index: 1 });
  });

  it("non-matching inputs return none", () => {
    expect(evaluateSlotReply({ text: "3 bhk", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "2 bhk please", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "1st", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "I want 2", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "my flat is 2", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "20", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "0", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "4", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "   ", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "yes", slots, now })).toEqual({ kind: "none" });
  });

  it("exact label match case-insensitive with whitespace collapse", () => {
    expect(evaluateSlotReply({ text: "tue, 20 oct at 10:00 am", slots, now })).toEqual({ kind: "select", index: 0 });
    expect(evaluateSlotReply({ text: "Tue, 20 Oct at 2:00 PM.", slots, now })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "10:00 AM", slots, now })).toEqual({ kind: "none" });
    expect(evaluateSlotReply({ text: "Tue 20 Oct", slots, now })).toEqual({ kind: "none" });
  });

  it("stale slots when chosen slot is in the past", () => {
    const nowLater = new Date("2026-10-20T06:00:00.000Z");
    const slotsWithPast: SlotChoice[] = [
      { label: "Tue, 20 Oct at 10:00 AM", datetime: "2026-10-20T04:30:00.000Z" },
      { label: "Tue, 20 Oct at 2:00 PM", datetime: "2026-10-20T08:30:00.000Z" },
      { label: "Wed, 21 Oct at 10:00 AM", datetime: "2026-10-21T04:30:00.000Z" },
    ];

    expect(evaluateSlotReply({ text: "1", slots: slotsWithPast, now: nowLater })).toEqual({ kind: "stale" });
    expect(evaluateSlotReply({ text: "2", slots: slotsWithPast, now: nowLater })).toEqual({ kind: "select", index: 1 });
    expect(evaluateSlotReply({ text: "tue, 20 oct at 10:00 am", slots: slotsWithPast, now: nowLater })).toEqual({ kind: "stale" });
  });

  it("garbage datetime returns stale", () => {
    const badSlots: SlotChoice[] = [
      { label: "Tue, 20 Oct at 10:00 AM", datetime: "2026-10-20T04:30:00.000Z" },
      { label: "Tue, 20 Oct at 2:00 PM", datetime: "garbage" },
      { label: "Wed, 21 Oct at 10:00 AM", datetime: "2026-10-21T04:30:00.000Z" },
    ];

    expect(evaluateSlotReply({ text: "2", slots: badSlots, now })).toEqual({ kind: "stale" });
  });

  it("does not mutate input and returns fresh objects", () => {
    const inputSlots = [
      { label: "Tue, 20 Oct at 10:00 AM", datetime: "2026-10-20T04:30:00.000Z" },
      { label: "Tue, 20 Oct at 2:00 PM", datetime: "2026-10-20T08:30:00.000Z" },
      { label: "Wed, 21 Oct at 10:00 AM", datetime: "2026-10-21T04:30:00.000Z" },
    ];
    const before = JSON.stringify(inputSlots);
    evaluateSlotReply({ text: "1", slots: inputSlots, now });
    const after = JSON.stringify(inputSlots);
    expect(after).toBe(before);

    const result1 = evaluateSlotReply({ text: "1", slots, now });
    const result2 = evaluateSlotReply({ text: "1", slots, now });
    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });
});
