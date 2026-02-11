import fs from "node:fs/promises";
import path from "node:path";
import type { SessionFileMetadata, SessionFilesIndex } from "./types.js";
import { shouldUseHdSessionFiles } from "../../extensions/hd/session-files-adapter.js";

export async function loadIndex(indexPath: string): Promise<SessionFilesIndex> {
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content) as SessionFilesIndex;
    return parsed;
  } catch (err) {
    // File doesn't exist, return empty index
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { files: [] };
    }
    // Other errors (e.g., JSON.parse failures) should be surfaced
    throw err;
  }
}

export async function saveIndex(indexPath: string, index: SessionFilesIndex): Promise<void> {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

export async function addFileToIndex(indexPath: string, file: SessionFileMetadata): Promise<void> {
  const index = await loadIndex(indexPath);
  index.files.push(file);
  await saveIndex(indexPath, index);
}

export async function removeFileFromIndex(indexPath: string, fileId: string): Promise<void> {
  const index = await loadIndex(indexPath);
  index.files = index.files.filter((f) => f.id !== fileId);
  await saveIndex(indexPath, index);
}

export { shouldUseHdSessionFiles };
