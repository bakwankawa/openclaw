import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearInternalHooks,
  registerInternalHook,
  type AgentBootstrapHookContext,
} from "../hooks/internal-hooks.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { resolveBootstrapContextForRun, resolveBootstrapFilesForRun } from "./bootstrap-files.js";

describe("resolveBootstrapFilesForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("applies bootstrap hook overrides", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const files = await resolveBootstrapFilesForRun({ workspaceDir });

    expect(files.some((file) => file.name === "EXTRA.md")).toBe(true);
  });
});

describe("resolveBootstrapContextForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("returns context files for hook-adjusted bootstrap files", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const extra = result.contextFiles.find((file) => file.path === "EXTRA.md");

    expect(extra?.content).toBe("extra");
  });

  it("uses per-session USER profile for non-main agent sessions", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.mkdir(path.join(workspaceDir, "users"), { recursive: true });
    await writeWorkspaceFile({
      dir: workspaceDir,
      name: "users/telegram-direct-6254545718.md",
      content: "Name: Telegram User A",
    });

    const result = await resolveBootstrapContextForRun({
      workspaceDir,
      sessionKey: "agent:main:telegram:direct:6254545718",
    });

    const userFile = result.contextFiles.find(
      (file) => file.path === "users/telegram-direct-6254545718.md",
    );
    expect(userFile?.content).toContain("Telegram User A");
  });

  it("includes auto-generated USER.md for non-main session without per-session profile", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");

    const result = await resolveBootstrapContextForRun({
      workspaceDir,
      sessionKey: "agent:main:telegram:direct:6254545718",
    });

    expect(
      result.contextFiles.some((file) => file.path === "users/telegram-direct-6254545718.md"),
    ).toBe(true);
  });

  it("auto-creates per-session USER profile on first non-main run", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const sessionKey = "agent:main:telegram:direct:6254545718";
    const profilePath = path.join(workspaceDir, "users", "telegram-direct-6254545718.md");

    const result = await resolveBootstrapContextForRun({
      workspaceDir,
      sessionKey,
    });

    await expect(fs.access(profilePath)).resolves.toBeUndefined();
    const content = await fs.readFile(profilePath, "utf-8");
    expect(content).toContain("# USER.md - About This Session User");
    expect(content).toContain("telegram:direct:6254545718");
    expect(
      result.contextFiles.some((file) => file.path === "users/telegram-direct-6254545718.md"),
    ).toBe(true);
  });
});
