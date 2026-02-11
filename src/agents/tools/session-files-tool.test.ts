import { describe, it, expect, vi, beforeEach } from "vitest";
import * as hdRuntime from "../../extensions/hd/session-files-runtime.js";
import * as storage from "../../sessions/files/storage.js";
import {
  createSessionFilesListTool,
  createSessionFilesGetTool,
  createSessionFilesQueryCsvTool,
  createSessionFilesQueryTabularTool,
} from "./session-files-tool.js";

vi.mock("../../sessions/files/storage.js");
vi.mock("../../extensions/hd/session-files-runtime.js", () => ({
  getHdSessionFilesRuntime: vi.fn(() => null),
}));

describe("session_files_list tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HD_SESSION_FILES_ENABLED;
  });

  it("lists files in session", async () => {
    const mockFiles = [
      {
        id: "file-1",
        filename: "test.csv",
        type: "csv" as const,
        storageFormat: "markdown" as const,
        uploadedAt: Date.now(),
        size: 100,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        csvSchema: { columns: ["a", "b"], rowCount: 2 },
      },
    ];
    vi.spyOn(storage, "listFiles").mockResolvedValue(mockFiles);

    const tool = createSessionFilesListTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.files).toHaveLength(1);
    expect(json.files[0].filename).toBe("test.csv");
    expect(json.files[0].storageFormat).toBe("markdown");
  });

  it("includes storageFormat in session_files_list response", async () => {
    const mockFile = {
      id: "file-1",
      filename: "test.csv",
      type: "csv" as const,
      storageFormat: "markdown" as const,
      uploadedAt: Date.now(),
      size: 100,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      csvSchema: { columns: ["a", "b"], rowCount: 2 },
    };
    vi.spyOn(storage, "listFiles").mockResolvedValue([mockFile]);

    const tool = createSessionFilesListTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.files).toHaveLength(1);
    expect(json.files[0].storageFormat).toBe("markdown");
    expect(json.files[0].type).toBe("csv");
  });
});

describe("session_files_get tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets file content", async () => {
    const mockFile = {
      buffer: Buffer.from("test content"),
      metadata: {
        id: "file-1",
        filename: "test.txt",
        type: "text" as const,
        storageFormat: "markdown" as const,
        uploadedAt: Date.now(),
        size: 12,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    };
    vi.spyOn(storage, "getFile").mockResolvedValue(mockFile);

    const tool = createSessionFilesGetTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
      fileId: "file-1",
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.content).toBe("test content");
    expect(json.metadata.filename).toBe("test.txt");
    expect(json.metadata.storageFormat).toBe("markdown");
  });

  it("includes storageFormat in session_files_get response", async () => {
    const mockFile = {
      buffer: Buffer.from("test content"),
      metadata: {
        id: "file-1",
        filename: "test.csv",
        type: "csv" as const,
        storageFormat: "markdown" as const,
        uploadedAt: Date.now(),
        size: 12,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    };
    vi.spyOn(storage, "getFile").mockResolvedValue(mockFile);

    const tool = createSessionFilesGetTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
      fileId: "file-1",
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.metadata.storageFormat).toBe("markdown");
    expect(json.metadata.type).toBe("csv");
  });
});

describe("session_files_query_csv tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries CSV file", async () => {
    const mockParsed = {
      columns: ["name", "sales"],
      rows: [
        { name: "Product A", sales: 1000 },
        { name: "Product B", sales: 2000 },
      ],
    };
    vi.spyOn(storage, "getParsedCsv").mockResolvedValue(mockParsed);

    const tool = createSessionFilesQueryCsvTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
      fileId: "file-1",
      filterColumn: "sales",
      filterOperator: "gt",
      filterValue: 1000,
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].sales).toBe(2000);
  });
});

describe("session_files_query_tabular tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries tabular file rows with numeric filters", async () => {
    const mockParsed = {
      columns: ["name", "sales", "__sheet"],
      rows: [
        { name: "Product A", sales: 1000, __sheet: "Sheet1" },
        { name: "Product B", sales: 2000, __sheet: "Sheet1" },
      ],
    };
    vi.spyOn(storage, "getParsedTabular").mockResolvedValue(mockParsed);

    const tool = createSessionFilesQueryTabularTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
      fileId: "file-1",
      filterColumn: "sales",
      filterOperator: "gt",
      filterValue: 1500,
    });
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].name).toBe("Product B");
    expect(json.columns).toEqual(["name", "sales", "__sheet"]);
  });

  it("routes tabular query through HD runtime when flag enabled", async () => {
    process.env.HD_SESSION_FILES_ENABLED = "1";
    vi.spyOn(storage, "getParsedTabular").mockResolvedValue({
      columns: [],
      rows: [],
    });
    vi.mocked(hdRuntime.getHdSessionFilesRuntime).mockReturnValue({
      getParsedCsv: vi.fn(async () => ({ columns: [], rows: [] })),
      getParsedTabular: vi.fn(async () => ({
        columns: ["name", "score"],
        rows: [{ name: "alpha", score: 10 }],
      })),
    });

    const tool = createSessionFilesQueryTabularTool({
      config: {},
      agentSessionKey: "agent:main:main",
    });
    expect(tool).toBeTruthy();

    const result = await tool!.execute("call-1", {
      sessionId: "test-session",
      fileId: "file-1",
      filterColumn: "name",
      filterOperator: "eq",
      filterValue: "alpha",
    });

    expect(storage.getParsedTabular).not.toHaveBeenCalled();
    const content = result.content[0];
    expect(content.type).toBe("text");
    const json = JSON.parse(content.text);
    expect(json.rows).toEqual([{ name: "alpha", score: 10 }]);
  });
});
