/**
 * Extract sessionKey from memory file metadata.
 * Memory files from session-memory hook have format:
 * - **Session Key**: agent:main:telegram:direct:6254545718
 */
export function extractSessionKeyFromMemoryFile(content: string): string | null {
  if (!content || typeof content !== "string") {
    return null;
  }

  // Look for "Session Key" in metadata section (usually near top of file)
  const lines = content.split("\n");
  for (const line of lines) {
    // Match: "- **Session Key**: agent:main:telegram:direct:6254545718"
    const match = line.match(/^\s*-\s*\*\*Session Key\*\*:\s*(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}
