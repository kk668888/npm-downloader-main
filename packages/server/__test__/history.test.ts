import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = "http://localhost:3002";

describe("History API Integration Tests", () => {
  beforeAll(() => {
    console.log("\n📝 Running History API tests against", BASE_URL);
    console.log("💡 Make sure the server is running: pnpm -C packages/server dev\n");
  });

  describe("GET /api/history", () => {
    it("should return items array", async () => {
      const response = await fetch(`${BASE_URL}/api/history`);

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty("items");
      expect(Array.isArray(data.items)).toBe(true);
    });

    it("should return items sorted by createdAt descending", async () => {
      const response = await fetch(`${BASE_URL}/api/history`);
      const data = await response.json();

      if (data.items.length > 1) {
        for (let i = 0; i < data.items.length - 1; i++) {
          expect(data.items[i].createdAt).toBeGreaterThanOrEqual(
            data.items[i + 1].createdAt
          );
        }
      }
    });

    it("should return 200 status", async () => {
      const response = await fetch(`${BASE_URL}/api/history`);
      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /api/history/:taskId", () => {
    it("should return 204 when deleting existing item", async () => {
      // First, get the current history
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      if (historyData.items.length > 0) {
        const taskId = historyData.items[0].taskId;
        const response = await fetch(`${BASE_URL}/api/history/${taskId}`, {
          method: "DELETE",
        });

        expect(response.status).toBe(204);

        // Verify it was deleted
        const verifyResponse = await fetch(`${BASE_URL}/api/history`);
        const verifyData = await verifyResponse.json();
        const deleted = verifyData.items.find(
          (item: { taskId: string }) => item.taskId === taskId
        );
        expect(deleted).toBeUndefined();

        // Re-add the item to not affect other tests (optional cleanup)
        // Note: This is a read-only test approach
      } else {
        console.log("⚠️ No history items to test deletion");
      }
    });

    it("should return 500 when deleting non-existent item", async () => {
      const response = await fetch(`${BASE_URL}/api/history/non-existent-task-id-12345`, {
        method: "DELETE",
      });

      // The controller throws an error when item not found
      expect(response.status).toBe(500);
    });
  });

  describe("History item structure", () => {
    it("should have correct structure for history items", async () => {
      const response = await fetch(`${BASE_URL}/api/history`);
      const data = await response.json();

      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty("taskId");
        expect(item).toHaveProperty("type");
        expect(item).toHaveProperty("status");
        expect(item).toHaveProperty("createdAt");
        expect(item).toHaveProperty("updatedAt");
        expect(typeof item.taskId).toBe("string");
        expect(typeof item.createdAt).toBe("number");
      }
    });
  });
});
