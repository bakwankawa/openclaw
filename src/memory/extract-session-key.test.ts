import { describe, it, expect } from "vitest";
import {
  buildHdSessionFilter,
  setHdMemoryAdapter,
  shouldUseHdMemory,
} from "../extensions/hd/memory-adapter.js";

describe("memory HD adapter flag", () => {
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

  it("builds SQL session filter only when HD memory is enabled", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    try {
      process.env.HD_MEMORY_ENABLED = "0";
      expect(buildHdSessionFilter({ sessionKey: "abc", tableAlias: "c" })).toEqual({
        sql: "",
        params: [],
      });

      process.env.HD_MEMORY_ENABLED = "1";
      expect(buildHdSessionFilter({ sessionKey: "abc", tableAlias: "c" })).toEqual({
        sql: " AND c.session_key = ?",
        params: ["abc"],
      });
    } finally {
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
      setHdMemoryAdapter(undefined);
    }
  });

  it("uses custom HD adapter filter when registered", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    process.env.HD_MEMORY_ENABLED = "1";
    setHdMemoryAdapter({
      buildSessionFilter: ({ sessionKey }) => ({
        sql: " AND custom = ?",
        params: [sessionKey ?? ""],
      }),
    });
    try {
      expect(buildHdSessionFilter({ sessionKey: "k1" })).toEqual({
        sql: " AND custom = ?",
        params: ["k1"],
      });
    } finally {
      setHdMemoryAdapter(undefined);
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
    }
  });
});
