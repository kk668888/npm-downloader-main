import { describe, it, expect, vi, beforeEach } from "vitest";
import semver from "semver";

// ========================================
// 导入真实实现
// ========================================
import {
  setTaskStatus,
  getTaskStatus,
  validateTaskToken,
  waitForAuditConfirmation,
  confirmAudit,
  clearAuditConfirmation,
} from "../src/services/taskStatus.js";
import { clearAllHistory } from "../src/services/history.js";

// ========================================
// 1. isVersionAffected — 使用与 auditService 相同的 semver 逻辑
// ========================================
function isVersionAffected(version: string, range: string): boolean {
  if (!range || range === "*") return true;
  try {
    const coerced = semver.coerce(version);
    if (!coerced) return true;
    return semver.satisfies(coerced, range, { includePrerelease: true });
  } catch {
    return true;
  }
}

describe("isVersionAffected (auditService 逻辑)", () => {
  it(">=1.0.0 <2.0.0 范围匹配", () => {
    expect(isVersionAffected("1.0.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(isVersionAffected("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(isVersionAffected("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(isVersionAffected("0.9.9", ">=1.0.0 <2.0.0")).toBe(false);
  });

  it("^1.2.0 范围匹配", () => {
    expect(isVersionAffected("1.2.0", "^1.2.0")).toBe(true);
    expect(isVersionAffected("1.3.0", "^1.2.0")).toBe(true);
    expect(isVersionAffected("2.0.0", "^1.2.0")).toBe(false);
    expect(isVersionAffected("1.1.9", "^1.2.0")).toBe(false);
  });

  it("~1.2.0 范围匹配", () => {
    expect(isVersionAffected("1.2.0", "~1.2.0")).toBe(true);
    expect(isVersionAffected("1.2.5", "~1.2.0")).toBe(true);
    expect(isVersionAffected("1.3.0", "~1.2.0")).toBe(false);
  });

  it("1.x 范围匹配", () => {
    expect(isVersionAffected("1.0.0", "1.x")).toBe(true);
    expect(isVersionAffected("1.99.99", "1.x")).toBe(true);
    expect(isVersionAffected("2.0.0", "1.x")).toBe(false);
  });

  it("|| 组合范围匹配", () => {
    expect(isVersionAffected("1.0.0", "<1.2.0 || >=2.0.0")).toBe(true);
    expect(isVersionAffected("1.5.0", "<1.2.0 || >=2.0.0")).toBe(false);
    expect(isVersionAffected("2.0.0", "<1.2.0 || >=2.0.0")).toBe(true);
    expect(isVersionAffected("3.0.0", "<1.2.0 || >=2.0.0")).toBe(true);
  });

  it("通配符和空值", () => {
    expect(isVersionAffected("1.0.0", "*")).toBe(true);
    expect(isVersionAffected("1.0.0", "")).toBe(true);
  });

  it("无效版本默认返回 true（安全优先）", () => {
    expect(isVersionAffected("not-a-version", ">=1.0.0")).toBe(true);
  });
});

// ========================================
// 2. taskStatus — setTaskStatus + getTaskStatus + validateTaskToken
// ========================================
describe("taskStatus — token 校验（真实实现）", () => {
  beforeEach(() => {
    clearAllHistory();
  });

  it("setTaskStatus 会生成 token，getTaskStatus 能取回", () => {
    setTaskStatus("test-token-1", "pending", "test");
    const item = getTaskStatus("test-token-1");
    expect(item).toBeDefined();
    expect(item!.token).toBeTruthy();
    expect(typeof item!.token).toBe("string");
    expect(item!.token.length).toBeGreaterThan(0);
  });

  it("validateTaskToken — 正确 token 通过", () => {
    setTaskStatus("test-token-2", "pending", "test");
    const item = getTaskStatus("test-token-2");
    expect(validateTaskToken("test-token-2", item!.token)).toBe(true);
  });

  it("validateTaskToken — 错误 token 拒绝", () => {
    setTaskStatus("test-token-3", "pending", "test");
    expect(validateTaskToken("test-token-3", "wrong-token")).toBe(false);
  });

  it("validateTaskToken — 空 token 拒绝", () => {
    setTaskStatus("test-token-4", "pending", "test");
    expect(validateTaskToken("test-token-4", "")).toBe(false);
  });

  it("validateTaskToken — 不存在的 taskId 拒绝", () => {
    expect(validateTaskToken("nonexistent", "any-token")).toBe(false);
  });

  it("后续 setTaskStatus 保留首次 token", () => {
    setTaskStatus("test-token-5", "pending", "step1");
    const token1 = getTaskStatus("test-token-5")!.token;
    setTaskStatus("test-token-5", "processing", "step2");
    const token2 = getTaskStatus("test-token-5")!.token;
    expect(token1).toBe(token2);
  });
});

// ========================================
// 3. waitForAuditConfirmation + confirmAudit — 真实实现
// ========================================
describe("taskStatus — 审计确认机制（真实实现）", () => {
  beforeEach(() => {
    clearAllHistory();
  });

  it("confirmAudit 在 waitForAuditConfirmation 之前调用 → 返回 false", () => {
    // 还没注册就直接确认
    expect(confirmAudit("no-such-task")).toBe(false);
  });

  it("waitForAuditConfirmation + confirmAudit 正常流程", async () => {
    setTaskStatus("confirm-test-1", "auditing", "等待确认");

    const promise = waitForAuditConfirmation("confirm-test-1");
    // 立即确认
    const result = confirmAudit("confirm-test-1");
    expect(result).toBe(true);

    // promise 应该 resolve
    await expect(promise).resolves.toBeUndefined();
  });

  it("已确认的任务再次确认 → 返回 false", async () => {
    setTaskStatus("confirm-test-2", "auditing", "等待确认");

    const promise = waitForAuditConfirmation("confirm-test-2");
    confirmAudit("confirm-test-2");
    await promise;

    // 再次确认
    expect(confirmAudit("confirm-test-2")).toBe(false);
  });

  it("waitForAuditConfirmation 超时后 reject AUDIT_CONFIRMATION_TIMEOUT", async () => {
    // 使用 vi.useFakeTimers 控制时间
    vi.useFakeTimers();
    setTaskStatus("timeout-test", "auditing", "等待确认");

    const promise = waitForAuditConfirmation("timeout-test");

    // 快进 15 分钟 + 1ms
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    await expect(promise).rejects.toThrow("AUDIT_CONFIRMATION_TIMEOUT");

    vi.useRealTimers();
  });

  it("clearAuditConfirmation 清理后 confirmAudit 返回 false", async () => {
    setTaskStatus("clear-test", "auditing", "等待确认");

    // 注册等待但不确认
    const promise = waitForAuditConfirmation("clear-test");

    // 清理
    clearAuditConfirmation("clear-test");

    // 确认应该失败
    expect(confirmAudit("clear-test")).toBe(false);

    vi.useRealTimers();
  });
});
