import { describe, expect, it, vi } from "vitest";

/**
 * retryWithBackoff / isErrorRetryable 的单元测试
 *
 * 覆盖：
 * 1. 404（不可重试）→ 立即抛出，不重试
 * 2. 可重试错误（5xx / 429 / 网络错误 / 超时 / AbortError）→ 重试到成功
 * 3. 达到 maxAttempts 仍失败 → 抛出最后一次错误
 * 4. 指数退避 + 抖动：每次延迟 > 0 且互不相同（抖动生效）
 */
import {
  retryWithBackoff,
  isErrorRetryable,
  DEFAULT_MAX_ATTEMPTS,
} from "../src/utils/retry.js";

describe("isErrorRetryable", () => {
  it("HTTP 404 视为不可重试（快速失败）", () => {
    const err = new Error("HTTP 错误！状态码：404");
    expect(isErrorRetryable(err)).toBe(false);
  });

  it("HTTP 404（多种文案格式）都不可重试", () => {
    expect(isErrorRetryable(new Error("Request failed with status code 404"))).toBe(false);
    expect(isErrorRetryable(new Error("status 404 not found"))).toBe(false);
  });

  it("HTTP 500 视为可重试", () => {
    expect(isErrorRetryable(new Error("HTTP 错误！状态码：500"))).toBe(true);
    expect(isErrorRetryable(new Error("Request failed with status code 500"))).toBe(true);
  });

  it("HTTP 429（限流）视为可重试", () => {
    expect(isErrorRetryable(new Error("HTTP 错误！状态码：429"))).toBe(true);
  });

  it("HTTP 503（服务不可用）视为可重试", () => {
    expect(isErrorRetryable(new Error("HTTP 错误！状态码：503"))).toBe(true);
  });

  it("AbortError / 超时视为可重试", () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    expect(isErrorRetryable(abortErr)).toBe(true);
    expect(isErrorRetryable(new Error("This operation was aborted due to timeout"))).toBe(true);
  });

  it("fetch 网络错误（ENOTFOUND / fetch failed）视为可重试", () => {
    expect(isErrorRetryable(new Error("fetch failed"))).toBe(true);
    const netErr = new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    expect(isErrorRetryable(netErr)).toBe(true);
  });

  it("其它未知错误默认视为可重试（保守策略）", () => {
    expect(isErrorRetryable(new Error("something unusual"))).toBe(true);
  });
});

describe("retryWithBackoff", () => {
  it("默认最大尝试次数为 5", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);
  });

  it("第一次成功时不重试", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await retryWithBackoff(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("404 错误立即抛出，不进行任何重试", async () => {
    const fn = vi.fn(async (): Promise<string> => {
      throw new Error("HTTP 错误！状态码：404");
    });
    const onRetry = vi.fn();

    await expect(
      retryWithBackoff(fn, { maxAttempts: 5, onRetry })
    ).rejects.toThrow(/404/);

    // 仅调用 1 次（首次失败即抛出，不重试）
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("可重试错误重试到成功", async () => {
    let calls = 0;
    const fn = vi.fn(async (): Promise<string> => {
      calls++;
      if (calls < 3) throw new Error("HTTP 错误！状态码：500");
      return "ok";
    });
    const onRetry = vi.fn();

    const result = await retryWithBackoff(fn, {
      maxAttempts: 5,
      delayMs: 1, // 加速测试
      onRetry,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("达到 maxAttempts 仍失败 → 抛出最后一次错误", async () => {
    const fn = vi.fn(async (): Promise<string> => {
      throw new Error("HTTP 错误！状态码：503");
    });
    const onRetry = vi.fn();

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, delayMs: 1, onRetry })
    ).rejects.toThrow(/503/);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // attempt 1, 2 各触发一次
  });

  it("退避随尝试次数指数增长且带随机抖动（延迟 > 0）", async () => {
    // 通过对 Math.random 打桩，让抖动恒为最大值（=base），
    // 这样期望延迟 = base * 2^(attempt-1) + base，精确可断言。
    // 用 delayMs=5 让真实 setTimeout 快速完成。
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);

    const delays: number[] = [];
    const realSetTimeout = setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((cb: () => void, ms?: number) => {
        if (typeof ms === "number" && ms > 0) delays.push(ms);
        return realSetTimeout(cb, ms);
      }) as never
    );

    try {
      const fn = vi.fn(async (): Promise<string> => {
        throw new Error("HTTP 错误！状态码：500");
      });

      await expect(
        retryWithBackoff(fn, { maxAttempts: 4, delayMs: 5 })
      ).rejects.toThrow(/500/);

      // 应有 3 次退避
      expect(delays).toHaveLength(3);
      // 每次都 > 0
      for (const d of delays) expect(d).toBeGreaterThan(0);
      // 抖动 = base（Math.random 返回 1），指数 = base * 2^(n-1)
      // attempt=1 → 5*1 + 5 = 10
      // attempt=2 → 5*2 + 5 = 15
      // attempt=3 → 5*4 + 5 = 25
      expect(delays[0]).toBe(10);
      expect(delays[1]).toBe(15);
      expect(delays[2]).toBe(25);
    } finally {
      randomSpy.mockRestore();
      spy.mockRestore();
    }
  });

  it("抖动随机性：不同 random 值产生不同延迟", async () => {
    const delays: number[] = [];
    const realSetTimeout = setTimeout;

    const runOnce = async (randVal: number): Promise<void> => {
      const local: number[] = [];
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(randVal);
      const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
        ((cb: () => void, ms?: number) => {
          if (typeof ms === "number" && ms > 0) local.push(ms);
          return realSetTimeout(cb, ms);
        }) as never
      );
      try {
        const fn = vi.fn(async (): Promise<string> => {
          throw new Error("HTTP 错误！状态码：500");
        });
        await expect(
          retryWithBackoff(fn, { maxAttempts: 2, delayMs: 10 })
        ).rejects.toThrow(/500/);
        delays.push(local[0]);
      } finally {
        randomSpy.mockRestore();
        spy.mockRestore();
      }
    };

    await runOnce(0);   // 抖动 = 0
    await runOnce(0.5); // 抖动 = 5
    await runOnce(1);   // 抖动 = 10

    // 三个延迟应互不相同（抖动生效）
    expect(delays).toHaveLength(3);
    expect(new Set(delays).size).toBe(3);
    expect(delays[0]).toBe(10); // 10*1 + 0
    expect(delays[1]).toBe(15); // 10*1 + 5
    expect(delays[2]).toBe(20); // 10*1 + 10
  });
});
