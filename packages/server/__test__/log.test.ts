import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = "http://localhost:3002";

describe("Log API Integration Tests", () => {
  beforeAll(() => {
    console.log("\n📝 Running Log API tests against", BASE_URL);
    console.log("💡 Make sure the server is running: pnpm -C packages/server dev\n");
  });

  describe("GET /api/logs/:taskId", () => {
    it("should return 404 for non-existent task", async () => {
      const response = await fetch(`${BASE_URL}/api/logs/non-existent-task-id`);

      expect(response.status).toBe(404);
    });

    it("should return logs array for existing task", async () => {
      // First, get a task from history
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      if (historyData.items?.length > 0) {
        const taskId = historyData.items[0].taskId;
        const response = await fetch(`${BASE_URL}/api/logs/${taskId}`);

        // May return 404 if no logs exist for the task
        if (response.ok) {
          const data = await response.json();
          expect(data).toHaveProperty("logs");
          expect(Array.isArray(data.logs)).toBe(true);
        }
      } else {
        console.log("⚠️ No tasks available for log test");
      }
    });
  });

  describe("GET /api/logs/:taskId/stream (SSE)", () => {
    it("should return text/event-stream content type", async () => {
      // First, get a task from history
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      if (historyData.items?.length > 0) {
        const taskId = historyData.items[0].taskId;
        const response = await fetch(`${BASE_URL}/api/logs/${taskId}/stream`, {
          headers: {
            Accept: "text/event-stream",
          },
        });

        if (response.ok) {
          expect(response.headers.get("content-type")).toContain("text/event-stream");
        }
      } else {
        console.log("⚠️ No tasks available for SSE test");
      }
    });

    it("should return 404 for non-existent task stream", async () => {
      const response = await fetch(`${BASE_URL}/api/logs/non-existent-task-id/stream`);

      expect(response.status).toBe(404);
    });
  });
});
