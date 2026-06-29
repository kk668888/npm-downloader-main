/**
 * 通用重试工具：指数退避 + 随机抖动，区分可重试 / 不可重试错误。
 *
 * 设计要点：
 * - 仅对"瞬时性"错误重试（限流 429、5xx、网络抖动、超时），加快重试收敛。
 * - HTTP 404 等确定性错误立即失败，避免无谓重试浪费时间。
 * - 退避 = base * 2^(attempt-1) + random(0, base)，避免"惊群"和同步重试。
 */
export interface RetryOptions {
  /** 最大尝试次数（含首次），默认 5 */
  maxAttempts?: number;
  /** 退避基准毫秒，默认 1000 */
  delayMs?: number;
  /** 每次重试前的回调（用于打日志） */
  onRetry?: (attempt: number, error: Error) => void;
}

/** 默认最大尝试次数：5（首次 + 4 次重试） */
export const DEFAULT_MAX_ATTEMPTS = 5;

/** 默认退避基准（毫秒） */
export const DEFAULT_DELAY_MS = 1000;

/**
 * 判断错误是否值得重试。
 *
 * 不可重试（快速失败）：
 * - HTTP 404 Not Found（包不存在，重试也无用）
 *
 * 可重试：
 * - HTTP 429（限流）
 * - HTTP 5xx（服务端临时故障）
 * - 网络错误（fetch failed / ENOTFOUND / ECONNRESET 等）
 * - 超时 / AbortError（AbortSignal.timeout 触发）
 *
 * 默认保守策略：未知错误一律视为可重试，避免漏掉可恢复的瞬时故障。
 *
 * @param error 捕获到的错误
 * @returns true 表示应重试，false 表示立即失败
 */
export function isErrorRetryable(error: unknown): boolean {
  // 非 Error 对象，转字符串判断
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  const lower = message.toLowerCase();

  // HTTP 404 → 不可重试（包/版本不存在）
  if (/\b404\b/.test(message) || lower.includes("not found")) {
    return false;
  }

  // AbortError（fetch 超时被 abort）→ 可重试
  if (name === "AbortError" || lower.includes("aborted")) {
    return true;
  }

  // HTTP 429 / 5xx → 可重试
  if (/\b429\b/.test(message)) return true;
  if (/\b5\d{2}\b/.test(message)) return true;

  // 网络层错误（DNS / 连接重置 / fetch 框架错误）→ 可重试
  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("network")
  ) {
    return true;
  }

  // 保守：未知错误默认可重试
  return true;
}

/**
 * 计算第 attempt 次重试前的退避时间（毫秒）。
 *
 * 公式：base * 2^(attempt-1) + random(0, base)
 * - attempt=1 → 1000~2000ms
 * - attempt=2 → 2000~3000ms
 * - attempt=3 → 4000~5000ms
 * - attempt=4 → 8000~9000ms
 *
 * 指数部分应对 registry 限流，随机部分（抖动）避免多个客户端同步重试。
 *
 * @param attempt 当前已失败的尝试次数（从 1 开始）
 * @param base 退避基准毫秒
 */
function computeBackoffMs(attempt: number, base: number): number {
  const exponential = base * Math.pow(2, attempt - 1);
  const jitter = Math.random() * base;
  return Math.round(exponential + jitter);
}

/**
 * 带指数退避 + 抖动的重试封装。
 *
 * @param fn 要执行的异步函数
 * @param options 重试选项
 * @returns 函数的成功返回值
 * @throws 若错误不可重试，立即抛出首次错误；若达到 maxAttempts 仍失败，抛出最后一次错误
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    delayMs = DEFAULT_DELAY_MS,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 不可重试错误：立即抛出，避免浪费尝试次数
      if (!isErrorRetryable(lastError)) {
        throw lastError;
      }

      // 已是最后一次尝试，不再 sleep，直接抛出
      if (attempt >= maxAttempts) {
        throw lastError;
      }

      // 通知调用方（用于打日志）
      onRetry?.(attempt, lastError);

      // 指数退避 + 抖动
      const backoff = computeBackoffMs(attempt, delayMs);
      await new Promise<void>((resolve) => setTimeout(resolve, backoff));
    }
  }

  // 理论上不会到达（for 循环内总会 return 或 throw）
  throw lastError ?? new Error("retryWithBackoff: exhausted attempts with no error");
}
