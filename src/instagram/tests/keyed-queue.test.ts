/**
 * Tests for keyed queue
 */

import { createKeyedQueue } from "../keyed-queue.js";

describe("keyed queue", () => {
  test("same key serializes execution order", async () => {
    const events: string[] = [];
    const enqueue = createKeyedQueue();

    const task1 = () =>
      new Promise<void>((resolve) => {
        events.push("a:start");
        setTimeout(() => {
          events.push("a:end");
          resolve();
        }, 30);
      });

    const task2 = () =>
      new Promise<void>((resolve) => {
        events.push("b:start");
        setTimeout(() => {
          events.push("b:end");
          resolve();
        }, 10);
      });

    const task3 = () =>
      new Promise<void>((resolve) => {
        events.push("c:start");
        events.push("c:end");
        resolve();
      });

    const p1 = enqueue("key", task1);
    const p2 = enqueue("key", task2);
    const p3 = enqueue("key", task3);

    await Promise.all([p1, p2, p3]);

    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  test("different keys run concurrently", async () => {
    const events: string[] = [];
    const enqueue = createKeyedQueue();

    const taskX = () =>
      new Promise<void>((resolve) => {
        events.push("x:start");
        setTimeout(() => {
          events.push("x:end");
          resolve();
        }, 30);
      });

    const taskY = () =>
      new Promise<void>((resolve) => {
        events.push("y:start");
        events.push("y:end");
        resolve();
      });

    const px = enqueue("x", taskX);
    const py = enqueue("y", taskY);

    await Promise.all([px, py]);

    const xEndIndex = events.indexOf("x:end");
    const yEndIndex = events.indexOf("y:end");

    expect(yEndIndex).toBeLessThan(xEndIndex);
  });

  test("rejecting task does not block next task", async () => {
    const events: string[] = [];
    const enqueue = createKeyedQueue();

    const failing = () =>
      new Promise<string>((_, reject) => {
        events.push("fail:start");
        setTimeout(() => {
          events.push("fail:end");
          reject(new Error("boom"));
        }, 10);
      });

    const succeeding = () =>
      new Promise<string>((resolve) => {
        events.push("ok:start");
        events.push("ok:end");
        resolve("success");
      });

    const p1 = enqueue("key", failing);
    const p2 = enqueue("key", succeeding);

    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("success");

    expect(events).toEqual(["fail:start", "fail:end", "ok:start", "ok:end"]);
  });

  test("queue returns task value and works after idle", async () => {
    const enqueue = createKeyedQueue();

    const task1 = () => Promise.resolve(42);
    const result1 = await enqueue("key", task1);

    expect(result1).toBe(42);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const task2 = () => Promise.resolve(99);
    const result2 = await enqueue("key", task2);

    expect(result2).toBe(99);
  });
});
