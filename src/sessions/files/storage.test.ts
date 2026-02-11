import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { saveFile, getFile, listFiles, deleteFile, getParsedCsv } from "./storage.js";
import { MAX_TABULAR_ROWS } from "./tabular-parser.js";

describe("file storage", () => {
  let testDir: string;
  const sessionId = "test-session";
  const agentId = "test-agent";

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-files-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("saves file and creates index", async () => {
    const buffer = Buffer.from("test content");
    const fileId = await saveFile({
      sessionId,
      agentId,
      filename: "test.txt",
      type: "text",
      buffer,
      filesDir: testDir,
    });
    expect(fileId).toBeTruthy();
    const file = await getFile({ sessionId, agentId, fileId, filesDir: testDir });
    // File is now saved as raw content (not wrapped in code block)
    const content = file.buffer.toString();
    expect(content).toBe("test content"); // Raw content, not wrapped
  });

  it("saves file with storageFormat markdown", async () => {
    const buffer = Buffer.from("test,data\n1,2");
    await saveFile({
      sessionId,
      agentId,
      filename: "test.csv",
      type: "csv",
      buffer,
      filesDir: testDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(1);
    expect(files[0].storageFormat).toBe("markdown");
    expect(files[0].type).toBe("csv"); // type should still be original content type
  });

  it("sets storageFormat markdown for all file types", async () => {
    const testCases = [
      { type: "csv" as const, content: "a,b\n1,2" },
      { type: "json" as const, content: '{"key":"value"}' },
      { type: "text" as const, content: "plain text" },
    ];

    for (const testCase of testCases) {
      const buffer = Buffer.from(testCase.content);
      await saveFile({
        sessionId,
        agentId,
        filename: `test.${testCase.type}`,
        type: testCase.type,
        buffer,
        filesDir: testDir,
      });
    }

    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files.length).toBeGreaterThanOrEqual(testCases.length);

    for (const file of files) {
      expect(file.storageFormat).toBe("markdown");
    }
  });

  it("saves CSV and parses it", async () => {
    const csv = "name,sales\nProduct A,1000";
    const buffer = Buffer.from(csv);
    await saveFile({
      sessionId,
      agentId,
      filename: "test.csv",
      type: "csv",
      buffer,
      filesDir: testDir,
    });
    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(1);
    expect(files[0].csvSchema?.columns).toEqual(["name", "sales"]);
  });

  it("keeps getParsedCsv backward compatible without __sheet field", async () => {
    const csv = "name,sales\nProduct A,1000\nProduct B,2000";
    const fileId = await saveFile({
      sessionId,
      agentId,
      filename: "legacy.csv",
      type: "csv",
      buffer: Buffer.from(csv, "utf-8"),
      filesDir: testDir,
    });

    const parsed = await getParsedCsv({
      sessionId,
      agentId,
      fileId,
      filesDir: testDir,
    });
    expect(parsed.columns).toEqual(["name", "sales"]);
    expect(parsed.rows[0]).toEqual({ name: "Product A", sales: 1000 });
    expect(parsed.rows[1]).toEqual({ name: "Product B", sales: 2000 });
  });

  it("saves TSV and writes parsed tabular metadata", async () => {
    const tsv = "name\tvalue\nalpha\t1\nbeta\t2";
    const fileId = await saveFile({
      sessionId,
      agentId,
      filename: "sample.tsv",
      type: "tsv",
      buffer: Buffer.from(tsv, "utf-8"),
      filesDir: testDir,
    });
    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("tsv");
    expect(files[0].tabularSchema?.mergedColumns).toEqual(["name", "value", "__sheet"]);
    const parsedPath = path.join(testDir, `${fileId}-sample.tsv.parsed.json`);
    const parsed = JSON.parse(await fs.readFile(parsedPath, "utf-8")) as {
      columns: string[];
      rows: Record<string, unknown>[];
    };
    expect(parsed.columns).toEqual(["name", "value", "__sheet"]);
    expect(parsed.rows).toHaveLength(2);
  });

  it("saves XLSX and writes merged multi-sheet metadata", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ product: "A", sales: 10 }]),
      "SheetA",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ product: "B", region: "SEA" }]),
      "SheetB",
    );
    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fileId = await saveFile({
      sessionId,
      agentId,
      filename: "report.xlsx",
      type: "xlsx",
      buffer: xlsxBuffer,
      filesDir: testDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("xlsx");
    expect(files[0].tabularSchema?.totalRows).toBe(2);
    expect(files[0].tabularSchema?.sheets).toEqual([
      { name: "SheetA", columns: ["product", "sales"], rowCount: 1 },
      { name: "SheetB", columns: ["product", "region"], rowCount: 1 },
    ]);

    const parsedPath = path.join(testDir, `${fileId}-report.xlsx.parsed.json`);
    const parsed = JSON.parse(await fs.readFile(parsedPath, "utf-8")) as {
      columns: string[];
      rows: Record<string, unknown>[];
    };
    expect(parsed.columns).toEqual(["product", "sales", "region", "__sheet"]);
    expect(parsed.rows).toHaveLength(2);
  });

  it("stores truncation metadata for oversized tabular files", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < MAX_TABULAR_ROWS + 5; i++) {
      rows.push({ idx: i, amount: i * 10 });
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Big");
    const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    await saveFile({
      sessionId,
      agentId,
      filename: "big.xlsx",
      type: "xlsx",
      buffer: xlsxBuffer,
      filesDir: testDir,
    });

    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(1);
    expect(files[0].tabularSchema?.truncated).toBe(true);
    expect(files[0].tabularSchema?.truncatedRows).toBe(5);
    expect(files[0].tabularSchema?.totalRows).toBe(MAX_TABULAR_ROWS);
  });

  it("lists all files in session", async () => {
    await saveFile({
      sessionId,
      agentId,
      filename: "file1.txt",
      type: "text",
      buffer: Buffer.from("content1"),
      filesDir: testDir,
    });
    await saveFile({
      sessionId,
      agentId,
      filename: "file2.csv",
      type: "csv",
      buffer: Buffer.from("a,b\n1,2"),
      filesDir: testDir,
    });
    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(2);
  });

  it("deletes file", async () => {
    const fileId = await saveFile({
      sessionId,
      agentId,
      filename: "test.txt",
      type: "text",
      buffer: Buffer.from("content"),
      filesDir: testDir,
    });
    await deleteFile({ sessionId, agentId, fileId, filesDir: testDir });
    const files = await listFiles({ sessionId, agentId, filesDir: testDir });
    expect(files).toHaveLength(0);
  });

  describe("deleteFile with markdown", () => {
    it("deletes .md file", async () => {
      const csvBuffer = Buffer.from("id,name\n1,Test", "utf-8");
      const fileId = await saveFile({
        sessionId,
        agentId,
        filename: "test.csv",
        type: "csv",
        buffer: csvBuffer,
        filesDir: testDir,
      });

      const mdPath = path.join(testDir, `${fileId}-test.csv.md`);
      await deleteFile({ sessionId, agentId, fileId, filesDir: testDir });

      const exists = await fs
        .access(mdPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe("saveFile with markdown", () => {
    it("saves CSV file as .md instead of .raw", async () => {
      const csvBuffer = Buffer.from("id,name\n1,Test", "utf-8");
      const fileId = await saveFile({
        sessionId,
        agentId,
        filename: "test.csv",
        type: "csv",
        buffer: csvBuffer,
        filesDir: testDir,
      });

      const mdPath = path.join(testDir, `${fileId}-test.csv.md`);
      const rawPath = path.join(testDir, `${fileId}-test.csv.raw`);

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

      // Content should be raw CSV (not markdown table)
      const mdContent = await fs.readFile(mdPath, "utf-8");
      expect(mdContent).toBe("id,name\n1,Test"); // Raw CSV content
    });

    it("saves JSON file as .md", async () => {
      const jsonBuffer = Buffer.from('{"key":"value"}', "utf-8");
      const fileId = await saveFile({
        sessionId,
        agentId,
        filename: "test.json",
        type: "json",
        buffer: jsonBuffer,
        filesDir: testDir,
      });

      const mdPath = path.join(testDir, `${fileId}-test.json.md`);
      const mdContent = await fs.readFile(mdPath, "utf-8");
      expect(mdContent).toBe('{"key":"value"}'); // Raw JSON content
    });

    it("saves text file as .md", async () => {
      const textBuffer = Buffer.from("Plain text content", "utf-8");
      const fileId = await saveFile({
        sessionId,
        agentId,
        filename: "test.txt",
        type: "text",
        buffer: textBuffer,
        filesDir: testDir,
      });

      const mdPath = path.join(testDir, `${fileId}-test.txt.md`);
      const mdContent = await fs.readFile(mdPath, "utf-8");
      expect(mdContent).toBe("Plain text content"); // Raw text content
    });
  });
});
