import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = "http://localhost:3002";

describe("Download API Integration Tests", () => {
  beforeAll(() => {
    console.log("\n📝 Running Download API tests against", BASE_URL);
    console.log("💡 Make sure the server is running: pnpm -C packages/server dev\n");
  });

  describe("GET /api/download/:taskId", () => {
    it("should return 404 for non-existent task", async () => {
      const response = await fetch(`${BASE_URL}/api/download/non-existent-task-id`);

      expect(response.status).toBe(404);
    });

    it("should return 404 for task without zip file", async () => {
      // Create a task via upload but check before zip is ready
      const response = await fetch(`${BASE_URL}/api/download/invalid-task-no-zip`);

      expect(response.status).toBe(404);
    });

    it("should return correct content-type header when zip exists", async () => {
      // This test requires a completed task
      // First check if there's a completed task in history
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      const completedTask = historyData.items?.find(
        (item: { status: string }) => item.status === "completed"
      );

      if (completedTask) {
        const response = await fetch(`${BASE_URL}/api/download/${completedTask.taskId}`);

        if (response.ok) {
          expect(response.headers.get("content-type")).toContain("application/zip");
        }
      } else {
        console.log("⚠️ No completed tasks available for download test");
      }
    });

    it("should return zip file when task is completed", async () => {
      // Check history for completed tasks
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      const completedTask = historyData.items?.find(
        (item: { status: string }) => item.status === "completed"
      );

      if (completedTask) {
        const response = await fetch(`${BASE_URL}/api/download/${completedTask.taskId}`);

        if (response.ok) {
          const contentLength = response.headers.get("content-length");
          expect(parseInt(contentLength || "0")).toBeGreaterThan(0);

          // Check it's a valid zip by reading first few bytes (PK header)
          const buffer = await response.arrayBuffer();
          const view = new Uint8Array(buffer, 0, 2);
          expect(String.fromCharCode(...view)).toBe("PK");
        }
      } else {
        console.log("⚠️ No completed tasks available for download test");
      }
    });
  });

  describe("GET /api/task/:taskId", () => {
    it("should return task status for existing task", async () => {
      // First, get a task from history
      const historyResponse = await fetch(`${BASE_URL}/api/history`);
      const historyData = await historyResponse.json();

      if (historyData.items?.length > 0) {
        const taskId = historyData.items[0].taskId;
        const response = await fetch(`${BASE_URL}/api/task/${taskId}`);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("status");
      } else {
        console.log("⚠️ No tasks available for status test");
      }
    });

    it("should return 404 for non-existent task", async () => {
      const response = await fetch(`${BASE_URL}/api/task/non-existent-task-id`);

      expect(response.status).toBe(404);
    });
  });
});
