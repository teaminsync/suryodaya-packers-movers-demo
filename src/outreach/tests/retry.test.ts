import { withRetry } from "../retry.js";

describe("withRetry", () => {
  it("succeeds on first try", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    let calls = 0;
    const fn = async () => {
      calls++;
      return "success";
    };

    const result = await withRetry(fn, [500, 2000, 8000], sleep);

    expect(result).toBe("success");
    expect(delays).toEqual([]);
    expect(calls).toBe(1);
  });

  it("fails twice then succeeds", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) {
        throw new Error("e" + calls);
      }
      return "success";
    };

    const result = await withRetry(fn, [500, 2000, 8000], sleep);

    expect(result).toBe("success");
    expect(delays).toEqual([500, 2000]);
    expect(calls).toBe(3);
  });

  it("always fails and rethrows last error", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("e" + calls);
    };

    await expect(withRetry(fn, [1, 2], sleep)).rejects.toThrow("e3");
    expect(delays).toEqual([1, 2]);
    expect(calls).toBe(3);
  });

  it("empty delays with failing fn", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("fail");
    };

    await expect(withRetry(fn, [], sleep)).rejects.toThrow("fail");
    expect(delays).toEqual([]);
    expect(calls).toBe(1);
  });
});
