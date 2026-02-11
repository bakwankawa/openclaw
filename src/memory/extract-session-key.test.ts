import { describe, it, expect } from "vitest";
import { shouldUseHdMemory } from "../extensions/hd/memory-adapter.js";
import { extractSessionKeyFromMemoryFile } from "./extract-session-key.js";

describe("extractSessionKeyFromMemoryFile", () => {
  it("extracts sessionKey from memory file metadata", () => {
    const content = `# Session: 2026-02-10 16:06:00 UTC

- **Session Key**: agent:main:telegram:direct:6254545718
- **Session ID**: abc123
- **Source**: telegram

## Conversation Summary

User: hello
Assistant: hi`;
    const sessionKey = extractSessionKeyFromMemoryFile(content);
    expect(sessionKey).toBe("agent:main:telegram:direct:6254545718");
  });

  it("returns null if sessionKey not found", () => {
    const content = `# Session: 2026-02-10 16:06:00 UTC

- **Session ID**: abc123
- **Source**: telegram`;
    const sessionKey = extractSessionKeyFromMemoryFile(content);
    expect(sessionKey).toBeNull();
  });

  it("handles empty content", () => {
    const sessionKey = extractSessionKeyFromMemoryFile("");
    expect(sessionKey).toBeNull();
  });

  it("returns true when HD_MEMORY_ENABLED=1", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    process.env.HD_MEMORY_ENABLED = "1";
    try {
      expect(shouldUseHdMemory()).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
    }
  });
});
