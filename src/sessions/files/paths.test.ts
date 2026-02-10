import { describe, it, expect } from "vitest";
import { resolveSessionFilesDir } from "./paths.js";

describe("resolveSessionFilesDir", () => {
  it("resolves files directory for session", () => {
    const dir = resolveSessionFilesDir("session-123", "agent-main");
    expect(dir).toContain("sessions/files/session-123");
    expect(dir).toContain("agents/agent-main");
  });

  it("uses default agentId when not provided", () => {
    const dir = resolveSessionFilesDir("session-123");
    expect(dir).toContain("sessions/files/session-123");
  });
});
