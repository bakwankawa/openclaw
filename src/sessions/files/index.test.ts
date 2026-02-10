import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SessionFileMetadata, SessionFilesIndex } from "./types.js";
import { loadIndex, saveIndex, addFileToIndex } from "./index.js";

describe("index manager", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-files-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("creates new index if not exists", async () => {
    const indexPath = path.join(testDir, "index.json");
    const index = await loadIndex(indexPath);
    expect(index.files).toEqual([]);
  });

  it("loads existing index", async () => {
    const indexPath = path.join(testDir, "index.json");
    const existing: SessionFilesIndex = {
      files: [
        {
          id: "file-1",
          filename: "test.csv",
          type: "csv",
          uploadedAt: Date.now(),
          size: 100,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
      ],
    };
    await fs.writeFile(indexPath, JSON.stringify(existing, null, 2));
    const index = await loadIndex(indexPath);
    expect(index.files).toHaveLength(1);
    expect(index.files[0].filename).toBe("test.csv");
  });

  it("saves index to file", async () => {
    const indexPath = path.join(testDir, "index.json");
    const index: SessionFilesIndex = { files: [] };
    await saveIndex(indexPath, index);
    const exists = await fs
      .access(indexPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    const loaded = await loadIndex(indexPath);
    expect(loaded.files).toEqual([]);
  });

  it("adds file to index", async () => {
    const indexPath = path.join(testDir, "index.json");
    const file: SessionFileMetadata = {
      id: "file-1",
      filename: "test.csv",
      type: "csv",
      storageFormat: "markdown",
      uploadedAt: Date.now(),
      size: 100,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    await addFileToIndex(indexPath, file);
    const index = await loadIndex(indexPath);
    expect(index.files).toHaveLength(1);
    expect(index.files[0].id).toBe("file-1");
  });
});
