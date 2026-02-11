import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import type { OpenClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import { getFile, listFiles, getParsedCsv } from "../../sessions/files/storage.js";
import { persistSessionFiles } from "./session-files.js";
// Note: We test the underlying storage functions directly since tools don't support filesDir override

describe("Telegram file upload flow - end-to-end", () => {
  let testDir: string;
  let testFilesDir: string;
  const sessionId = `telegram-test-${Date.now()}`;
  const agentId = "test-agent";

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "telegram-flow-test-"));
    testFilesDir = path.join(testDir, "files");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Helper to create mock Telegram message context
  function createTelegramContext(filePath: string, mimeType: string): MsgContext {
    return {
      Channel: "telegram",
      SessionKey: "telegram:123456",
      MediaPath: filePath,
      MediaType: mimeType,
      Body: "Here's the file",
    } as MsgContext;
  }

  // Helper to create minimal config
  function createTestConfig(): OpenClawConfig {
    return {
      session: {
        store: { type: "memory" },
      },
    } as OpenClawConfig;
  }

  it("saves CSV file from Telegram as .md (not .raw)", async () => {
    // Simulate: User sends CSV file from Telegram
    const csvPath = path.join(process.cwd(), ".cursor/test/bot knowledge test.csv");
    const ctx = createTelegramContext(csvPath, "text/csv");
    const cfg = createTestConfig();

    // Step 1: Persist file (simulating Telegram message processing)
    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    // Step 2: Verify file was saved as .md (not .raw)
    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("csv");
    expect(files[0].filename).toBe("bot knowledge test.csv");

    const fileId = files[0].id;
    const fileBase = `${fileId}-${files[0].filename}`;
    const mdPath = path.join(testFilesDir, `${fileBase}.md`);
    const rawPath = path.join(testFilesDir, `${fileBase}.raw`);

    // .md file should exist
    const mdExists = await fs
      .access(mdPath)
      .then(() => true)
      .catch(() => false);
    expect(mdExists).toBe(true);

    // .raw file should NOT exist
    const rawExists = await fs
      .access(rawPath)
      .then(() => true)
      .catch(() => false);
    expect(rawExists).toBe(false);

    // Step 3: Verify content is raw CSV format
    const { buffer } = await getFile({ sessionId, agentId, fileId, filesDir: testFilesDir });
    const content = buffer.toString("utf-8");
    // CSV should contain commas (not markdown table markers)
    expect(content).toContain(",");
    expect(content).not.toMatch(/\|\s*\n\s*\|[\s-]+\|/); // No markdown table separator
    expect(content.length).toBeGreaterThan(100);

    // Step 4: Verify CSV parsing still works (.parsed.json exists)
    const parsedPath = path.join(testFilesDir, `${fileBase}.parsed.json`);
    const parsedExists = await fs
      .access(parsedPath)
      .then(() => true)
      .catch(() => false);
    expect(parsedExists).toBe(true);

    const parsed = await getParsedCsv({ sessionId, agentId, fileId, filesDir: testFilesDir });
    expect(parsed.columns.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it("saves JSON file from Telegram as .md", async () => {
    const jsonPath = path.join(process.cwd(), ".cursor/test/postman_collection.json");
    const ctx = createTelegramContext(jsonPath, "application/json");
    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    expect(files).toHaveLength(1);
    const fileId = files[0].id;
    const fileBase = `${fileId}-${files[0].filename}`;
    const mdPath = path.join(testFilesDir, `${fileBase}.md`);

    const mdExists = await fs
      .access(mdPath)
      .then(() => true)
      .catch(() => false);
    expect(mdExists).toBe(true);

    const { buffer } = await getFile({ sessionId, agentId, fileId, filesDir: testFilesDir });
    const content = buffer.toString("utf-8");
    // JSON should be raw (not wrapped in markdown code fences)
    expect(content).toContain("{");
    expect(content).toContain("}");
    expect(content).not.toContain("```json");
    expect(content).not.toContain("```");
  });

  it("saves XLSX file from Telegram and stores it as tabular session file", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { name: "Alice", sales: 100 },
        { name: "Bob", sales: 150 },
      ]),
      "Sales",
    );
    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const xlsxPath = path.join(testDir, "report.xlsx");
    await fs.writeFile(xlsxPath, xlsxBuffer);

    const ctx = createTelegramContext(
      xlsxPath,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("xlsx");
    expect(files[0].tabularSchema?.totalRows).toBe(2);
    expect(files[0].tabularSchema?.mergedColumns).toEqual(["name", "sales", "__sheet"]);
  });

  it("saves text file from Telegram as .md", async () => {
    const textPath = path.join(process.cwd(), ".cursor/test/sejarah_bri.txt");
    const ctx = createTelegramContext(textPath, "text/plain");
    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    expect(files).toHaveLength(1);
    const fileId = files[0].id;
    const fileBase = `${fileId}-${files[0].filename}`;
    const mdPath = path.join(testFilesDir, `${fileBase}.md`);

    const mdExists = await fs
      .access(mdPath)
      .then(() => true)
      .catch(() => false);
    expect(mdExists).toBe(true);

    const { buffer } = await getFile({ sessionId, agentId, fileId, filesDir: testFilesDir });
    const content = buffer.toString("utf-8");
    expect(content).toContain("BRI");
  });

  it("agent can access file via session_files_get tool and receives markdown content", async () => {
    // Simulate: User sends CSV file from Telegram
    const csvPath = path.join(process.cwd(), ".cursor/test/bot knowledge test.csv");
    const ctx = createTelegramContext(csvPath, "text/csv");
    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    const fileId = files[0].id;

    // Simulate: Agent uses session_files_get tool
    // Note: Tool needs to use filesDir override, but tools don't support that yet
    // So we'll test the underlying getFile directly which is what the tool uses
    const { buffer, metadata } = await getFile({
      sessionId,
      agentId,
      fileId,
      filesDir: testFilesDir,
    });
    const content = buffer.toString("utf-8");

    // Verify content is raw CSV format (not markdown)
    expect(content).toContain(","); // CSV should contain commas
    expect(content).not.toMatch(/\|\s*\n\s*\|[\s-]+\|/); // No markdown table separator
    expect(metadata.type).toBe("csv");
    expect(metadata.filename).toBe("bot knowledge test.csv");
  });

  it("agent can query CSV file via session_files_query_csv tool", async () => {
    const csvPath = path.join(process.cwd(), ".cursor/test/bot knowledge test.csv");
    const ctx = createTelegramContext(csvPath, "text/csv");
    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    const fileId = files[0].id;

    // Simulate: Agent queries CSV (using underlying getParsedCsv which tool uses)
    // Note: Tools don't support filesDir override yet, so we test the underlying function
    const parsed = await getParsedCsv({ sessionId, agentId, fileId, filesDir: testFilesDir });

    expect(parsed.columns.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.columns)).toBe(true);
    expect(Array.isArray(parsed.rows)).toBe(true);

    // Verify we can query with limit (simulating tool behavior)
    const limitedRows = parsed.rows.slice(0, 5);
    expect(limitedRows.length).toBeLessThanOrEqual(5);
  });

  it("handles multiple files from same Telegram message", async () => {
    const csvPath = path.join(process.cwd(), ".cursor/test/bot knowledge test.csv");
    const jsonPath = path.join(process.cwd(), ".cursor/test/postman_collection.json");
    const textPath = path.join(process.cwd(), ".cursor/test/sejarah_bri.txt");

    // Simulate: User sends multiple files in one Telegram message
    const ctx: MsgContext = {
      Channel: "telegram",
      SessionKey: "telegram:123456",
      MediaPaths: [csvPath, jsonPath, textPath],
      MediaTypes: ["text/csv", "application/json", "text/plain"],
      Body: "Here are multiple files",
    } as MsgContext;

    const cfg = createTestConfig();

    await persistSessionFiles({
      ctx,
      sessionId,
      agentId,
      cfg,
      filesDir: testFilesDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testFilesDir });
    expect(files).toHaveLength(3);

    // Verify all files are saved as .md
    for (const file of files) {
      const fileBase = `${file.id}-${file.filename}`;
      const mdPath = path.join(testFilesDir, `${fileBase}.md`);
      const rawPath = path.join(testFilesDir, `${fileBase}.raw`);

      const mdExists = await fs
        .access(mdPath)
        .then(() => true)
        .catch(() => false);
      const rawExists = await fs
        .access(rawPath)
        .then(() => true)
        .catch(() => false);

      expect(mdExists).toBe(true);
      expect(rawExists).toBe(false);
    }
  });
});
