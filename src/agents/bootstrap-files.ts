import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { isSubagentSessionKey, parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
import { buildBootstrapContextFiles, resolveBootstrapMaxChars } from "./pi-embedded-helpers.js";
import {
  DEFAULT_USER_FILENAME,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
} from "./workspace.js";

export function makeBootstrapWarn(params: {
  sessionLabel: string;
  warn?: (message: string) => void;
}): ((message: string) => void) | undefined {
  if (!params.warn) {
    return undefined;
  }
  return (message: string) => params.warn?.(`${message} (sessionKey=${params.sessionLabel})`);
}

export async function resolveBootstrapFilesForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const sessionKey = params.sessionKey ?? params.sessionId;
  let bootstrapFiles = filterBootstrapFilesForSession(
    await loadWorkspaceBootstrapFiles(params.workspaceDir),
    sessionKey,
  );
  const sessionUserFile = await resolveSessionScopedUserProfileFile({
    workspaceDir: params.workspaceDir,
    sessionKey,
  });
  if (sessionUserFile) {
    bootstrapFiles = [
      ...bootstrapFiles.filter((file) => file.name !== DEFAULT_USER_FILENAME),
      sessionUserFile,
    ];
  }
  return applyBootstrapHookOverrides({
    files: bootstrapFiles,
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });
}

async function resolveSessionScopedUserProfileFile(params: {
  workspaceDir: string;
  sessionKey?: string;
}): Promise<WorkspaceBootstrapFile | null> {
  const key = params.sessionKey?.trim();
  if (!key || isSubagentSessionKey(key)) {
    return null;
  }
  const parsed = parseAgentSessionKey(key);
  if (!parsed) {
    return null;
  }
  const rest = parsed.rest.trim().toLowerCase();
  if (!rest || rest === "main") {
    return null;
  }
  const slug = rest.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    return null;
  }
  const profilePath = path.join(params.workspaceDir, "users", `${slug}.md`);
  await ensureSessionUserProfileFile({
    profilePath,
    sessionRest: parsed.rest.trim(),
  });
  try {
    const content = await fs.readFile(profilePath, "utf-8");
    return {
      name: DEFAULT_USER_FILENAME,
      path: profilePath,
      content,
      missing: false,
    };
  } catch {
    return null;
  }
}

async function ensureSessionUserProfileFile(params: {
  profilePath: string;
  sessionRest: string;
}): Promise<void> {
  try {
    await fs.access(params.profilePath);
    return;
  } catch {
    // create below
  }
  await fs.mkdir(path.dirname(params.profilePath), { recursive: true });
  const template = buildSessionUserProfileTemplate(params.sessionRest);
  try {
    await fs.writeFile(params.profilePath, template, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "EEXIST") {
      throw err;
    }
  }
}

function buildSessionUserProfileTemplate(sessionRest: string): string {
  return (
    "# USER.md - About This Session User\n\n" +
    "_Auto-generated for non-main session. Update as you learn this specific user._\n\n" +
    `- **Session:** ${sessionRest}\n` +
    "- **Name:**\n" +
    "- **What to call them:**\n" +
    "- **Pronouns:** _(optional)_\n" +
    "- **Timezone:**\n" +
    "- **Notes:**\n\n" +
    "## Context\n\n" +
    "_Only facts/preferences for this user/session. Do not copy global profile notes._\n"
  );
}

export async function resolveBootstrapContextForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
}> {
  const bootstrapFiles = await resolveBootstrapFilesForRun(params);
  const contextFiles = buildBootstrapContextFiles(bootstrapFiles, {
    maxChars: resolveBootstrapMaxChars(params.config),
    warn: params.warn,
  });
  return { bootstrapFiles, contextFiles };
}
