import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildHdSessionFilter,
  loadHdMemoryAdapter,
  resetHdMemoryAdapterCache,
  resolveHdDirectIsolationTarget,
  resolveHdDmScope,
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
      resetHdMemoryAdapterCache();
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
      resetHdMemoryAdapterCache();
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
    }
  });

  it("falls back to legacy DM scope + isolation when external adapter is unavailable", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    process.env.HD_MEMORY_ENABLED = "1";
    resetHdMemoryAdapterCache();
    setHdMemoryAdapter(undefined);
    try {
      expect(resolveHdDmScope({ channel: "telegram" })).toBe("main");
      expect(resolveHdDmScope({ channel: "webchat" })).toBe("main");
      expect(resolveHdDmScope({ channel: "discord" })).toBe("main");
      expect(resolveHdDirectIsolationTarget({ surface: "telegram", senderId: "6254545718" })).toBe(
        undefined,
      );
    } finally {
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
      resetHdMemoryAdapterCache();
      setHdMemoryAdapter(undefined);
    }
  });

  it("uses custom DM scope + direct isolation target when adapter is registered", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    process.env.HD_MEMORY_ENABLED = "1";
    setHdMemoryAdapter({
      resolveDmScope: ({ configured, channel }) =>
        configured ?? (channel === "telegram" ? "per-account-channel-peer" : "main"),
      resolveDirectIsolationTarget: ({ surface, senderId }) => {
        if (surface?.toLowerCase() !== "telegram" || !senderId) {
          return undefined;
        }
        return { channel: "telegram", peerId: senderId.toLowerCase() };
      },
    });
    try {
      expect(resolveHdDmScope({ channel: "telegram" })).toBe("per-account-channel-peer");
      expect(
        resolveHdDirectIsolationTarget({
          surface: "telegram",
          senderId: "6254545718",
        }),
      ).toEqual({
        channel: "telegram",
        peerId: "6254545718",
      });
    } finally {
      setHdMemoryAdapter(undefined);
      resetHdMemoryAdapterCache();
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
    }
  });

  it("keeps legacy DM scope + isolation when HD memory flag is disabled", () => {
    const original = process.env.HD_MEMORY_ENABLED;
    process.env.HD_MEMORY_ENABLED = "0";
    setHdMemoryAdapter({
      resolveDmScope: () => "per-account-channel-peer",
      resolveDirectIsolationTarget: () => ({ channel: "telegram", peerId: "forced" }),
    });
    try {
      expect(resolveHdDmScope({ channel: "telegram" })).toBe("main");
      expect(
        resolveHdDirectIsolationTarget({
          surface: "telegram",
          senderId: "6254545718",
        }),
      ).toBeUndefined();
    } finally {
      setHdMemoryAdapter(undefined);
      resetHdMemoryAdapterCache();
      if (original === undefined) {
        delete process.env.HD_MEMORY_ENABLED;
      } else {
        process.env.HD_MEMORY_ENABLED = original;
      }
    }
  });

  it("returns undefined when external HD memory module import fails", async () => {
    const adapter = await loadHdMemoryAdapter("@commitdulubarungopi/non-existent");
    expect(adapter).toBeUndefined();
  });

  it("loads external HD memory module when import succeeds", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hd-memory-adapter-"));
    const modulePath = path.join(dir, "adapter.mjs");
    await fs.writeFile(
      modulePath,
      "export const buildSessionFilter = ({ sessionKey }) => ({ sql: ' AND custom = ?', params: [sessionKey ?? ''] });\n",
      "utf-8",
    );

    const adapter = await loadHdMemoryAdapter(pathToFileURL(modulePath).href);
    expect(adapter?.buildSessionFilter?.({ sessionKey: "k1" })).toEqual({
      sql: " AND custom = ?",
      params: ["k1"],
    });
  });
});
