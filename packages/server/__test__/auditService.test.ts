import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllHistory } from "../src/services/history.js";
import { auditPackages } from "../src/services/auditService.js";

describe("auditPackages version matching", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearAllHistory();
  });

  it("does not coerce non-semver versions into vulnerable ranges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            example: [
              {
                title: "Critical issue",
                severity: "critical",
                url: "https://example.test/advisory",
                vulnerable_versions: "<=1.2.3",
                patched_versions: ">1.2.3",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const report = await auditPackages(
      "audit-version-test",
      [{ name: "example", version: "1.2.3.4" }],
      true
    );

    expect(report.auditStatus).toBe("safe");
    expect(report.summary.critical).toBe(0);
    expect(report.results[0]?.vulnerabilities).toHaveLength(0);
  });
});
