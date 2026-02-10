import { describe, it, expect } from "vitest";
import { ensureMemoryIndexSchema } from "./memory-schema.js";
import { requireNodeSqlite } from "./sqlite.js";

describe("memory schema sessionKey column", () => {
  it("adds session_key column to chunks table", () => {
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(":memory:");
    ensureMemoryIndexSchema({
      db,
      embeddingCacheTable: "embedding_cache",
      ftsTable: "fts_memory",
      ftsEnabled: false,
    });

    const info = db.prepare("PRAGMA table_info(chunks)").all() as Array<{
      name: string;
      type: string;
    }>;
    const sessionKeyColumn = info.find((col) => col.name === "session_key");
    expect(sessionKeyColumn).toBeDefined();
    expect(sessionKeyColumn?.type).toBe("TEXT");

    db.close();
  });
});
