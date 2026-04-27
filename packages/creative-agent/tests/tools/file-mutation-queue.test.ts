import { describe, expect, test } from "bun:test";
import { withFileMutationQueue } from "../../src/tools/file-mutation-queue.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withFileMutationQueue", () => {
  test("같은 파일 작업은 순서대로 실행한다", async () => {
    const order: string[] = [];
    const filePath = "/tmp/agentchan-file-mutation-queue-same";

    const first = withFileMutationQueue(filePath, async () => {
      order.push("first:start");
      await delay(20);
      order.push("first:end");
    });
    const second = withFileMutationQueue(filePath, async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  test("다른 파일 작업은 병렬로 실행한다", async () => {
    const order: string[] = [];

    await Promise.all([
      withFileMutationQueue("/tmp/agentchan-file-mutation-queue-a", async () => {
        order.push("a:start");
        await delay(20);
        order.push("a:end");
      }),
      withFileMutationQueue("/tmp/agentchan-file-mutation-queue-b", async () => {
        order.push("b:start");
        await delay(20);
        order.push("b:end");
      }),
    ]);

    expect(order.indexOf("a:start")).toBeLessThan(order.indexOf("a:end"));
    expect(order.indexOf("b:start")).toBeLessThan(order.indexOf("b:end"));
    expect(order.indexOf("b:start")).toBeLessThan(order.indexOf("a:end"));
  });
});
