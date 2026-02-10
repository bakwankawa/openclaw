import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import {
  handleToolExecutionStart,
  handleToolExecutionEnd,
} from "./pi-embedded-subscribe.handlers.tools.js";

// Mock console.warn to capture log output
const originalConsoleWarn = console.warn;
let consoleWarnCalls: string[] = [];

beforeEach(() => {
  consoleWarnCalls = [];
  console.warn = vi.fn((...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    consoleWarnCalls.push(msg);
    originalConsoleWarn(...args);
  });
});

afterEach(() => {
  console.warn = originalConsoleWarn;
});

describe("handleToolExecutionStart", () => {
  it("logs tool start to console.warn", async () => {
    const toolCallId = "test-tool-call-12345";
    const toolName = "session_files_list";
    const runId = "test-run-123";

    const mockCtx: Partial<EmbeddedPiSubscribeContext> = {
      params: {
        runId,
        onBlockReplyFlush: undefined,
        onToolResult: undefined,
        onAgentEvent: undefined,
      },
      state: {
        toolMetaById: new Map(),
        toolSummaryById: new Set(),
        pendingMessagingTexts: new Map(),
        pendingMessagingTargets: new Map(),
        toolMetas: [],
      },
      log: {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      flushBlockReplyBuffer: vi.fn(),
      shouldEmitToolResult: () => false,
      emitToolSummary: vi.fn(),
      emitToolOutput: vi.fn(),
      trimMessagingToolSent: vi.fn(),
    };

    await handleToolExecutionStart(
      mockCtx as EmbeddedPiSubscribeContext,
      {
        toolName,
        toolCallId,
        args: {},
      } as never,
    );

    // Verify console.warn was called with tool log message
    expect(consoleWarnCalls.length).toBeGreaterThan(0);
    const toolLogCall = consoleWarnCalls.find((msg) => msg.includes(`[tool] ${toolName} start`));
    expect(toolLogCall).toBeTruthy();
    expect(toolLogCall).toContain(toolCallId.slice(0, 8));
  });
});

describe("handleToolExecutionEnd", () => {
  it("logs tool result to console.warn", () => {
    const toolCallId = "test-tool-call-67890";
    const toolName = "session_files_get";
    const runId = "test-run-456";

    const mockCtx: Partial<EmbeddedPiSubscribeContext> = {
      params: {
        runId,
        onToolResult: undefined,
        onAgentEvent: undefined,
      },
      state: {
        toolMetaById: new Map([[toolCallId, undefined]]),
        toolSummaryById: new Set([toolCallId]),
        pendingMessagingTexts: new Map(),
        pendingMessagingTargets: new Map(),
        toolMetas: [],
      },
      log: {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      shouldEmitToolOutput: () => false,
      emitToolOutput: vi.fn(),
      trimMessagingToolSent: vi.fn(),
    };

    handleToolExecutionEnd(
      mockCtx as EmbeddedPiSubscribeContext,
      {
        toolName,
        toolCallId,
        isError: false,
        result: { files: [] },
      } as never,
    );

    // Verify console.warn was called with tool result log message
    expect(consoleWarnCalls.length).toBeGreaterThan(0);
    const toolLogCall = consoleWarnCalls.find((msg) => msg.includes(`[tool] ${toolName} result`));
    expect(toolLogCall).toBeTruthy();
    expect(toolLogCall).toContain(toolCallId.slice(0, 8));
  });

  it("logs tool error result with [ERROR] marker", () => {
    const toolCallId = "test-tool-call-error";
    const toolName = "session_files_get";
    const runId = "test-run-error";

    const mockCtx: Partial<EmbeddedPiSubscribeContext> = {
      params: {
        runId,
        onToolResult: undefined,
        onAgentEvent: undefined,
      },
      state: {
        toolMetaById: new Map([[toolCallId, undefined]]),
        toolSummaryById: new Set([toolCallId]),
        pendingMessagingTexts: new Map(),
        pendingMessagingTargets: new Map(),
        toolMetas: [],
      },
      log: {
        warn: vi.fn(),
        debug: vi.fn(),
      },
      shouldEmitToolOutput: () => false,
      emitToolOutput: vi.fn(),
      trimMessagingToolSent: vi.fn(),
    };

    handleToolExecutionEnd(
      mockCtx as EmbeddedPiSubscribeContext,
      {
        toolName,
        toolCallId,
        isError: true,
        result: { error: "File not found" },
      } as never,
    );

    // Verify console.warn was called with error marker
    const toolLogCall = consoleWarnCalls.find((msg) => msg.includes(`[tool] ${toolName} result`));
    expect(toolLogCall).toBeTruthy();
    expect(toolLogCall).toContain("[ERROR]");
  });
});
