import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { InputFileLimits } from "../../media/input-files.js";
import type { SessionFileType, SessionFileMetadata } from "./types.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import { extractPdfContent } from "../../media/input-files.js";
import { loadIndex, addFileToIndex, removeFileFromIndex } from "./index.js";
import { resolveSessionFilesDir } from "./paths.js";
import { parseTabularFile, type ParsedTabularResult } from "./tabular-parser.js";

// PDF extraction limits for session file storage
// These are more lenient than input file processing limits since files are stored for later use
const SESSION_FILE_PDF_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const SESSION_FILE_PDF_MAX_CHARS = 1_000_000; // 1M chars
const SESSION_FILE_PDF_MAX_PAGES = 100;
const SESSION_FILE_PDF_MAX_PIXELS = 10_000_000;
const SESSION_FILE_PDF_MIN_TEXT_CHARS = 10;
const SESSION_FILE_PDF_MAX_REDIRECTS = 5;
const SESSION_FILE_PDF_TIMEOUT_MS = 30_000;
const TABULAR_FILE_TYPES = new Set<SessionFileType>(["csv", "tsv", "xlsx", "xls", "ods"]);

export type ParsedTabularData = {
  columns: string[];
  rows: Record<string, unknown>[];
  sheets?: Array<{ name: string; columns: string[]; rowCount: number }>;
  totalRows?: number;
  truncated?: boolean;
  truncatedRows?: number;
  truncatedColumns?: number;
};

function formatTabularContent(params: {
  filename: string;
  columns: string[];
  rows: Record<string, unknown>[];
  maxRows?: number;
}): string {
  const { filename, columns, rows, maxRows = 100 } = params;
  const limitedRows = rows.slice(0, maxRows);
  const lines = [
    `Tabular file: ${filename}`,
    `Columns: ${columns.join(", ")}`,
    `Rows: ${rows.length}`,
    "",
    ...limitedRows.map((row) =>
      columns
        .map((col) => {
          const value = row[col];
          return value == null ? "" : String(value);
        })
        .join("\t"),
    ),
  ];
  return lines.join("\n");
}

export async function saveFile(params: {
  sessionId: string;
  agentId?: string;
  filename: string;
  type: SessionFileType;
  buffer: Buffer;
  filesDir?: string; // For testing
  retentionDays?: number; // File retention period in days (default: 7)
}): Promise<string> {
  const { sessionId, agentId, filename, type, buffer, filesDir, retentionDays = 7 } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");

  // Sanitize filename to prevent path traversal (strip directory components)
  const sanitizedFilename = path.basename(filename);

  const fileId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const fileBase = `${fileId}-${sanitizedFilename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);

  await fs.mkdir(baseDir, { recursive: true });

  const isTabular = TABULAR_FILE_TYPES.has(type);
  let parsedTabular: ParsedTabularResult | undefined;

  if (isTabular) {
    parsedTabular = await parseTabularFile({
      type,
      filename: sanitizedFilename,
      buffer,
    });
  }

  // Save content as readable UTF-8 text in .md for all types.
  let content: string;
  if (type === "pdf") {
    // PDF still needs extraction (can't store as raw binary). Extracted text is saved as raw content.
    const limits: InputFileLimits = {
      allowUrl: false,
      allowedMimes: new Set(["application/pdf"]),
      maxBytes: SESSION_FILE_PDF_MAX_BYTES,
      maxChars: SESSION_FILE_PDF_MAX_CHARS,
      maxRedirects: SESSION_FILE_PDF_MAX_REDIRECTS,
      timeoutMs: SESSION_FILE_PDF_TIMEOUT_MS,
      pdf: {
        maxPages: SESSION_FILE_PDF_MAX_PAGES,
        maxPixels: SESSION_FILE_PDF_MAX_PIXELS,
        minTextChars: SESSION_FILE_PDF_MIN_TEXT_CHARS,
      },
    };
    try {
      const extracted = await extractPdfContent({ buffer, limits });
      content = extracted.text || "";
    } catch (err) {
      // If PDF extraction fails, log error and save error message for user visibility
      const errorMessage = String(err);
      if (shouldLogVerbose()) {
        logVerbose(`PDF extraction failed for ${filename}: ${errorMessage}`);
      }
      // Save error message so users/agents know extraction failed (instead of empty string)
      content = `[PDF extraction failed: ${errorMessage}]`;
    }
  } else if (parsedTabular && (type === "xlsx" || type === "xls" || type === "ods")) {
    content = formatTabularContent({
      filename: sanitizedFilename,
      columns: parsedTabular.columns,
      rows: parsedTabular.rows,
    });
  } else {
    // Non-PDF, non-tabular types: save raw content
    content = buffer.toString("utf-8");
  }
  await fs.writeFile(mdPath, content, "utf-8");

  const metadata: SessionFileMetadata = {
    id: fileId,
    filename: sanitizedFilename,
    type,
    storageFormat: "markdown", // Always markdown
    uploadedAt: Date.now(),
    size: buffer.byteLength,
    expiresAt: Date.now() + retentionDays * 24 * 60 * 60 * 1000,
  };

  if (parsedTabular) {
    const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
    await fs.writeFile(parsedPath, JSON.stringify(parsedTabular, null, 2));
    metadata.tabularSchema = {
      sheets: parsedTabular.sheets,
      totalRows: parsedTabular.totalRows,
      mergedColumns: parsedTabular.columns,
      truncated: parsedTabular.truncated,
      truncatedRows: parsedTabular.truncatedRows,
      truncatedColumns: parsedTabular.truncatedColumns,
    };
    if (type === "csv") {
      metadata.csvSchema = {
        columns: parsedTabular.columns.filter((col) => col !== "__sheet"),
        rowCount: parsedTabular.totalRows,
      };
    }
  }

  await addFileToIndex(indexPath, metadata);
  return fileId;
}

export async function getFile(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<{ buffer: Buffer; metadata: SessionFileMetadata }> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }

  // Sanitize filename from metadata to prevent path traversal (defense in depth)
  const sanitizedFilename = path.basename(file.filename);
  const fileBase = `${fileId}-${sanitizedFilename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);
  const rawPath = path.join(baseDir, `${fileBase}.raw`);

  // Try .md first, fallback to .raw for backward compatibility
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(mdPath);
  } catch {
    // Fallback to .raw for backward compatibility
    buffer = await fs.readFile(rawPath);
  }

  return { buffer, metadata: file };
}

export async function listFiles(params: {
  sessionId: string;
  agentId?: string;
  filesDir?: string;
}): Promise<SessionFileMetadata[]> {
  const { sessionId, agentId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  return index.files;
}

export async function getParsedCsv(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const parsed = await getParsedTabular(params);
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }
  if (file.type !== "csv") {
    throw new Error(`File ${fileId} is not a CSV file`);
  }
  const columns = parsed.columns.filter((col) => col !== "__sheet");
  const rows = parsed.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const col of columns) {
      next[col] = row[col];
    }
    return next;
  });
  return { columns, rows };
}

export async function getParsedTabular(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<ParsedTabularData> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    throw new Error(`File ${fileId} not found`);
  }
  if (!TABULAR_FILE_TYPES.has(file.type)) {
    throw new Error(`File ${fileId} is not a tabular file`);
  }
  // Sanitize filename from metadata to prevent path traversal (defense in depth)
  const sanitizedFilename = path.basename(file.filename);
  const fileBase = `${fileId}-${sanitizedFilename}`;
  const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
  const content = await fs.readFile(parsedPath, "utf-8");
  const parsed = JSON.parse(content) as ParsedTabularData;
  return {
    columns: parsed.columns ?? [],
    rows: parsed.rows ?? [],
    sheets: parsed.sheets,
    totalRows: parsed.totalRows,
  };
}

export async function deleteFile(params: {
  sessionId: string;
  agentId?: string;
  fileId: string;
  filesDir?: string;
}): Promise<void> {
  const { sessionId, agentId, fileId, filesDir } = params;
  const baseDir = filesDir ?? resolveSessionFilesDir(sessionId, agentId);
  const indexPath = path.join(baseDir, "index.json");
  const index = await loadIndex(indexPath);
  const file = index.files.find((f) => f.id === fileId);
  if (!file) {
    return; // Already deleted
  }
  // Sanitize filename from metadata to prevent path traversal (defense in depth)
  const sanitizedFilename = path.basename(file.filename);
  const fileBase = `${fileId}-${sanitizedFilename}`;
  const mdPath = path.join(baseDir, `${fileBase}.md`);
  const rawPath = path.join(baseDir, `${fileBase}.raw`);

  // Delete .md file
  await fs.unlink(mdPath).catch(() => {});
  // Also try to delete .raw for cleanup (backward compatibility)
  await fs.unlink(rawPath).catch(() => {});

  if (TABULAR_FILE_TYPES.has(file.type)) {
    const parsedPath = path.join(baseDir, `${fileBase}.parsed.json`);
    await fs.unlink(parsedPath).catch(() => {});
  }
  await removeFileFromIndex(indexPath, fileId);
}
