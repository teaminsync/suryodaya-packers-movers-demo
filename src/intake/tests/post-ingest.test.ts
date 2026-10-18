/**
 * Tests for post-ingest hook
 */

import { createPostIngestHook, type PostIngestDeps } from "../post-ingest.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<PostIngestDeps> = {}): PostIngestDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaults: PostIngestDeps = {
    async prefill(leadId: string, text: string) {
      calls.push({ fn: "prefill", args: [leadId, text] });
      return { status: "filled", filled: ["origin", "destination"] };
    },
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as PostIngestDeps & { calls: CallRecord[] };
}

describe("createPostIngestHook", () => {
  it("leadId and text", async () => {
    const deps = makeDeps();
    const hook = createPostIngestHook(deps);

    await hook({
      event: { text: "Need to shift a 3BHK from Pune to Mumbai" },
      summary: { leadId: "l1" },
    });

    expect(deps.calls.length).toBe(1);
    expect(deps.calls[0].fn).toBe("prefill");
    expect(deps.calls[0].args[0]).toBe("l1");
    expect(deps.calls[0].args[1]).toBe("Need to shift a 3BHK from Pune to Mumbai");
  });

  it("summary with no leadId, and summary with leadId empty", async () => {
    const deps1 = makeDeps();
    const hook1 = createPostIngestHook(deps1);

    await hook1({
      event: { text: "Some text" },
      summary: {},
    });

    expect(deps1.calls.length).toBe(0);

    const deps2 = makeDeps();
    const hook2 = createPostIngestHook(deps2);

    await hook2({
      event: { text: "Some text" },
      summary: { leadId: "" },
    });

    expect(deps2.calls.length).toBe(0);
  });

  it("prefill throws", async () => {
    const deps = makeDeps({
      async prefill(leadId: string, text: string) {
        deps.calls.push({ fn: "prefill", args: [leadId, text] });
        throw new Error("boom");
      },
    });
    const hook = createPostIngestHook(deps);

    await expect(
      hook({
        event: { text: "Some text" },
        summary: { leadId: "l1" },
      })
    ).resolves.toBeUndefined();
  });

  it("placeholder text is passed through unchanged", async () => {
    const deps = makeDeps();
    const hook = createPostIngestHook(deps);

    await hook({
      event: { text: "[IndiaMART enquiry, type P]" },
      summary: { leadId: "l1" },
    });

    expect(deps.calls.length).toBe(1);
    expect(deps.calls[0].args[1]).toBe("[IndiaMART enquiry, type P]");
  });
});
