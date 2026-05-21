import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = "http://localhost:3002";

describe("Package API Integration Tests", () => {
  beforeAll(() => {
    console.log("\n📝 Running Package API tests against", BASE_URL);
    console.log("💡 Make sure the server is running: pnpm -C packages/server dev\n");
  });

  describe("POST /api/download-package", () => {
    it("should return taskId when valid packageName is provided", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: "lodash" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("taskId");
      expect(typeof data.taskId).toBe("string");
      expect(data.taskId.length).toBeGreaterThan(0);
    });

    it("should return zipUrl in response", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: "underscore" }),
      });

      const data = await response.json();
      expect(data).toHaveProperty("zipUrl");
      expect(data.zipUrl).toContain("/api/download/");
    });

    it("should return error when packageName is missing", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Should return an error status
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should return error when body is invalid JSON", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should accept scoped packages", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: "@types/node" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("taskId");
    });

    it("should accept packages with version", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: "lodash@4.17.21" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("taskId");
    });
  });

  describe("POST /api/download-package with version range", () => {
    it("should accept version ranges", async () => {
      const response = await fetch(`${BASE_URL}/api/download-package`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packageName: "express@^4.0.0" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("taskId");
    });
  });
});
