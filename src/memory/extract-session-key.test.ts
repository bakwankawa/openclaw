import { describe, it, expect } from "vitest";
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
});
