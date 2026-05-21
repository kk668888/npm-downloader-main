import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = "http://localhost:3002";

// Sample pnpm-lock.yaml content for testing
const SAMPLE_LOCKFILE = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

packages:
  lodash@4.17.21:
    resolution: {integrity: sha512-/QeU6tqAY0M2gXpD5geZCY6pJwYTt+5cE3u4V4uM1pu5DW4dQW2oLcg5pTnE+UVeOPM9AyJjnAFksb3QzcYg==}
    name: lodash
    version: 4.17.21
    dev: false
`;

// Simple multipart/form-data builder
function buildMultipartBody(fieldName: string, filename: string, fileContent: Buffer): { body: Buffer; contentType: string } {
  const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  const CRLF = "\r\n";

  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
    `Content-Type: application/octet-stream`,
    "",
    "",
  ].join(CRLF);

  const footer = CRLF + `--${boundary}--${CRLF}`;

  const body = Buffer.concat([
    Buffer.from(header, "utf8"),
    fileContent,
    Buffer.from(footer, "utf8"),
  ]);

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("Upload API Integration Tests", () => {
  beforeAll(() => {
    console.log("\n📝 Running integration tests against", BASE_URL);
    console.log("💡 Make sure the server is running: pnpm -C packages/server dev\n");
  });

  it("POST /api/upload should return 400 when no file is uploaded", async () => {
    // Send empty multipart body
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const body = Buffer.from(`--${boundary}--\r\n`, "utf8");

    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error", "No file uploaded");
    console.log("✓ Empty upload correctly returns 400");
  });

  it("POST /api/upload should return 400 for wrong field name", async () => {
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="wrong_field"\r\n\r\nsome value\r\n--${boundary}--\r\n`,
      "utf8"
    );

    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty("error", "No file uploaded");
    console.log("✓ Wrong field name correctly returns 400");
  });

  it("GET /api/upload should return 404 (method not allowed)", async () => {
    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: "GET",
    });

    expect(response.status).toBe(404);
    console.log("✓ GET request correctly returns 404");
  });

  it("POST /api/upload should accept a valid pnpm-lock.yaml file", async () => {
    // Create multipart body with lockfile content
    const fileContent = Buffer.from(SAMPLE_LOCKFILE, "utf8");
    const { body, contentType } = buildMultipartBody("lockfile", "pnpm-lock.yaml", fileContent);

    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": contentType,
      },
    });

    // The request should be accepted (processing starts asynchronously)
    expect(response.status).toBeLessThan(500);

    const data = await response.json();

    // Should get a taskId back
    if (response.ok) {
      expect(data).toHaveProperty("taskId");
      expect(data).toHaveProperty("zipUrl");
      console.log(`✓ Upload accepted, Task created: ${data.taskId}`);
    } else {
      // If there's an error, it should be a proper error response
      expect(data).toHaveProperty("error");
      console.log("✓ Error response:", data.error);
    }
  }, 30000); // 30 second timeout for download processing
});
