import { describe, it, expect } from "vitest";
import { shouldUseHdMemory } from "../extensions/hd/memory-adapter.js";

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
});
