import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { MediaAttachmentCache } from "../../media-understanding/attachments.js";
import type { MediaAttachment } from "../../media-understanding/types.js";
import type { SessionFileType } from "../../sessions/files/types.js";
import type { MsgContext } from "../templating.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { logVerbose, shouldLogVerbose } from "../../globals.js";
import { resolveAttachmentKind } from "../../media-understanding/attachments.js";
import { normalizeMimeType } from "../../media/input-files.js";
import { saveFile } from "../../sessions/files/storage.js";

const TEXT_EXT_MIME = new Map<string, string>([
  [".csv", "text/csv"],
  [".tsv", "text/tab-separated-values"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".markdown", "text/markdown"],
  [".json", "application/json"],
  [".jsonl", "application/jsonl"],
  [".log", "text/plain"],
  [".text", "text/plain"],
]);

function resolveTextMimeFromName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }
  const ext = path.extname(name).toLowerCase();
  return TEXT_EXT_MIME.get(ext);
}

const SUPPORTED_MIMES = new Set([
  "text/csv",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
]);

function mimeToFileType(mime: string): SessionFileType | null {
  const normalized = normalizeMimeType(mime);
  if (!normalized) {
    return null;
  }
  if (normalized === "text/csv") {
    return "csv";
  }
  if (normalized === "application/pdf") {
    return "pdf";
  }
  if (normalized === "application/json") {
    return "json";
  }
  if (normalized.startsWith("text/")) {
    return "text";
  }
  return null;
}

export async function persistSessionFiles(params: {
  ctx: MsgContext;
  sessionId: string;
  agentId?: string;
  agentSessionKey?: string;
  cfg: OpenClawConfig;
  filesDir?: string; // For testing
}): Promise<void> {
  const { ctx, sessionId, agentId: providedAgentId, agentSessionKey, cfg } = params;
  const agentId =
    providedAgentId ??
    resolveSessionAgentId({
      sessionKey: agentSessionKey ?? ctx.SessionKey,
      config: cfg,
    });

  // Extract attachments from context
  const attachments = ctx.MediaPaths ?? (ctx.MediaPath ? [ctx.MediaPath] : []);
  const mediaTypes = ctx.MediaTypes ?? (ctx.MediaType ? [ctx.MediaType] : []);
  const mediaUrls = ctx.MediaUrls ?? (ctx.MediaUrl ? [ctx.MediaUrl] : []);

  if (attachments.length === 0 && mediaUrls.length === 0) {
    return; // No files to persist
  }

  // For now, we only support local file paths (MediaPaths)
  // URL-based files would require downloading first
  for (let i = 0; i < attachments.length; i++) {
    const filePath = attachments[i];
    if (!filePath) {
      continue;
    }

    const mime = mediaTypes[i] ?? "";
    const normalizedMime = normalizeMimeType(mime);
    if (!normalizedMime || !SUPPORTED_MIMES.has(normalizedMime)) {
      if (shouldLogVerbose()) {
        logVerbose(
          `session-files: skipping unsupported MIME type ${normalizedMime ?? mime} for ${filePath}`,
        );
      }
      continue;
    }

    const fileType = mimeToFileType(normalizedMime);
    if (!fileType) {
      continue;
    }

    try {
      const fs = await import("node:fs/promises");
      const buffer = await fs.readFile(filePath);
      const filename = path.basename(filePath) || `file-${i + 1}`;

      await saveFile({
        sessionId,
        agentId,
        filename,
        type: fileType,
        buffer,
        filesDir: params.filesDir,
        retentionDays: cfg.session?.files?.retentionDays,
      });

      if (shouldLogVerbose()) {
        logVerbose(`session-files: persisted ${filename} (${fileType}) to session ${sessionId}`);
      }
    } catch (err) {
      // Don't block on errors - log and continue
      if (shouldLogVerbose()) {
        logVerbose(`session-files: failed to persist ${filePath}: ${String(err)}`);
      }
    }
  }
}

export async function persistSessionFilesFromCache(params: {
  attachments: MediaAttachment[];
  cache: MediaAttachmentCache;
  sessionId: string;
  agentSessionKey?: string;
  cfg: OpenClawConfig;
  limits: {
    maxBytes: number;
    timeoutMs: number;
    allowedMimes: Set<string>;
  };
  skipAttachmentIndexes?: Set<number>;
}): Promise<void> {
  const { attachments, cache, sessionId, agentSessionKey, cfg, limits, skipAttachmentIndexes } =
    params;
  if (!attachments || attachments.length === 0) {
    return;
  }

  const agentId = resolveSessionAgentId({
    sessionKey: agentSessionKey,
    config: cfg,
  });

  for (const attachment of attachments) {
    if (!attachment) {
      continue;
    }
    if (skipAttachmentIndexes?.has(attachment.index)) {
      continue;
    }

    const forcedTextMime = resolveTextMimeFromName(attachment.path ?? attachment.url ?? "");
    const kind = forcedTextMime ? "document" : resolveAttachmentKind(attachment);
    if (!forcedTextMime && (kind === "image" || kind === "video" || kind === "audio")) {
      continue;
    }

    let bufferResult: Awaited<ReturnType<typeof cache.getBuffer>>;
    try {
      bufferResult = await cache.getBuffer({
        attachmentIndex: attachment.index,
        maxBytes: limits.maxBytes,
        timeoutMs: limits.timeoutMs,
      });
    } catch (err) {
      if (shouldLogVerbose()) {
        logVerbose(
          `session-files: failed to get buffer for attachment ${attachment.index}: ${String(err)}`,
        );
      }
      continue;
    }

    const nameHint = bufferResult?.fileName ?? attachment.path ?? attachment.url;
    const forcedTextMimeResolved = forcedTextMime ?? resolveTextMimeFromName(nameHint ?? "");
    const rawMime = bufferResult?.mime ?? attachment.mime;
    const normalizedMime = normalizeMimeType(rawMime);

    const mimeType = forcedTextMimeResolved ?? normalizedMime;
    if (!mimeType || !SUPPORTED_MIMES.has(mimeType)) {
      continue;
    }

    const fileType = mimeToFileType(mimeType);
    if (!fileType) {
      continue;
    }

    try {
      const filename =
        bufferResult.fileName ?? nameHint?.split("/").pop() ?? `file-${attachment.index + 1}`;
      await saveFile({
        sessionId,
        agentId,
        filename,
        type: fileType,
        buffer: bufferResult.buffer,
        retentionDays: cfg.session?.files?.retentionDays,
      });

      if (shouldLogVerbose()) {
        logVerbose(`session-files: persisted ${filename} (${fileType}) to session ${sessionId}`);
      }
    } catch (err) {
      // Don't block on errors - log and continue
      if (shouldLogVerbose()) {
        logVerbose(
          `session-files: failed to persist attachment ${attachment.index}: ${String(err)}`,
        );
      }
    }
  }
}
