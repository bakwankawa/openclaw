import path from "node:path";

export type HdTabularFileType = "csv" | "tsv" | "xlsx" | "xls" | "ods";

export type HdParsedTabularData = {
  columns: string[];
  rows: Record<string, unknown>[];
  sheets?: Array<{ name: string; columns: string[]; rowCount: number }>;
  totalRows?: number;
  truncated?: boolean;
  truncatedRows?: number;
  truncatedColumns?: number;
};

export type HdTabularQueryResult = {
  rows: Record<string, unknown>[];
  total: number;
  columns: string[];
};

export type HdSessionFilesAdapter = {
  parseTabularFile?: (params: {
    type: HdTabularFileType;
    filename: string;
    buffer: Buffer;
  }) => Promise<HdParsedTabularData>;
  normalizeParsedTabular?: (parsed: Partial<HdParsedTabularData>) => HdParsedTabularData;
  queryParsedTabular?: (params: {
    parsed: HdParsedTabularData;
    limit?: number;
    selectColumns?: string[];
    filter?: unknown;
  }) => HdTabularQueryResult;
};

let adapterOverride: HdSessionFilesAdapter | undefined;
let externalAdapter: HdSessionFilesAdapter | undefined;
let externalAdapterLoadPromise: Promise<void> | null = null;

const MIME_TO_TABULAR_TYPE: Record<string, HdTabularFileType> = {
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
};

const EXT_TO_TABULAR_TYPE: Record<string, HdTabularFileType> = {
  ".csv": "csv",
  ".tsv": "tsv",
  ".xlsx": "xlsx",
  ".xls": "xls",
  ".ods": "ods",
};

export function shouldUseHdSessionFiles(): boolean {
  return process.env.HD_SESSION_FILES_ENABLED === "1";
}

export function setHdSessionFilesAdapter(next?: HdSessionFilesAdapter): void {
  adapterOverride = next;
}

export function resetHdSessionFilesAdapterCache(): void {
  externalAdapter = undefined;
  externalAdapterLoadPromise = null;
}

function toHdSessionFilesAdapter(mod: unknown): HdSessionFilesAdapter {
  const typed = mod as HdSessionFilesAdapter;
  return {
    parseTabularFile:
      typeof typed?.parseTabularFile === "function" ? typed.parseTabularFile : undefined,
    normalizeParsedTabular:
      typeof typed?.normalizeParsedTabular === "function"
        ? typed.normalizeParsedTabular
        : undefined,
    queryParsedTabular:
      typeof typed?.queryParsedTabular === "function" ? typed.queryParsedTabular : undefined,
  };
}

export async function loadHdSessionFilesAdapter(
  moduleName = "@commitdulubarungopi/hd-session-files-extension",
): Promise<HdSessionFilesAdapter | undefined> {
  try {
    const mod = await import(moduleName);
    return toHdSessionFilesAdapter(mod);
  } catch {
    return undefined;
  }
}

function loadExternalHdSessionFilesAdapter(): void {
  if (externalAdapterLoadPromise) {
    return;
  }
  externalAdapterLoadPromise = loadHdSessionFilesAdapter()
    .then((adapter) => {
      externalAdapter = adapter;
    })
    .catch(() => {
      externalAdapter = undefined;
    });
}

function getActiveAdapter(): HdSessionFilesAdapter | undefined {
  return adapterOverride ?? externalAdapter;
}

async function getActiveAdapterAsync(): Promise<HdSessionFilesAdapter | undefined> {
  if (adapterOverride) {
    return adapterOverride;
  }
  loadExternalHdSessionFilesAdapter();
  if (externalAdapterLoadPromise) {
    await externalAdapterLoadPromise;
  }
  return getActiveAdapter();
}

function resolveTabularType(params: {
  mimeType?: string;
  filename?: string;
}): HdTabularFileType | undefined {
  const mimeType = params.mimeType?.trim().toLowerCase();
  if (mimeType && MIME_TO_TABULAR_TYPE[mimeType]) {
    return MIME_TO_TABULAR_TYPE[mimeType];
  }
  const ext = path
    .extname(params.filename ?? "")
    .trim()
    .toLowerCase();
  return EXT_TO_TABULAR_TYPE[ext];
}

function normalizeParsedFallback(parsed: HdParsedTabularData): HdParsedTabularData {
  return {
    columns: parsed.columns ?? [],
    rows: parsed.rows ?? [],
    sheets: parsed.sheets,
    totalRows: parsed.totalRows,
    truncated: parsed.truncated ?? false,
    truncatedRows: parsed.truncatedRows ?? 0,
    truncatedColumns: parsed.truncatedColumns ?? 0,
  };
}

function queryParsedFallback(params: {
  parsed: HdParsedTabularData;
  limit: number;
}): HdTabularQueryResult {
  const columns = params.parsed.columns ?? [];
  const rows = (params.parsed.rows ?? []).slice(0, params.limit);
  return {
    columns,
    rows,
    total: params.parsed.rows?.length ?? 0,
  };
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatTabularPreview(params: {
  type: HdTabularFileType;
  parsed: HdParsedTabularData;
  query: HdTabularQueryResult;
}): string {
  const lines: string[] = [];
  lines.push(`Tabular preview (${params.type})`);
  lines.push(`Columns: ${params.query.columns.join(", ")}`);
  lines.push(`Rows: ${params.query.rows.length}/${params.query.total}`);
  if (params.parsed.truncated) {
    lines.push(
      `Truncated rows: ${params.parsed.truncatedRows ?? 0}, truncated columns: ${params.parsed.truncatedColumns ?? 0}`,
    );
  }
  for (const row of params.query.rows) {
    const rowText = params.query.columns
      .map((column) => `${column}=${formatCell(row[column])}`)
      .join(" | ");
    lines.push(rowText);
  }
  return lines.join("\n");
}

export async function extractHdTabularText(params: {
  mimeType?: string;
  filename: string;
  buffer: Buffer;
  maxChars: number;
  previewRows?: number;
}): Promise<string | undefined> {
  if (!shouldUseHdSessionFiles()) {
    return undefined;
  }
  const type = resolveTabularType({ mimeType: params.mimeType, filename: params.filename });
  if (!type) {
    return undefined;
  }

  const adapter = await getActiveAdapterAsync();
  if (!adapter?.parseTabularFile) {
    return undefined;
  }

  try {
    const parsedRaw = await adapter.parseTabularFile({
      type,
      filename: params.filename,
      buffer: params.buffer,
    });
    const parsed = adapter.normalizeParsedTabular
      ? adapter.normalizeParsedTabular(parsedRaw)
      : normalizeParsedFallback(parsedRaw);
    const limit = params.previewRows ?? 50;
    const query = adapter.queryParsedTabular
      ? adapter.queryParsedTabular({ parsed, limit })
      : queryParsedFallback({ parsed, limit });
    const text = formatTabularPreview({ type, parsed, query });
    return clampText(text, params.maxChars);
  } catch {
    return undefined;
  }
}
