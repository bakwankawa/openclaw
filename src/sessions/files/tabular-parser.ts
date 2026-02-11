import * as XLSX from "xlsx";
import type { SessionFileType } from "./types.js";
import { parseCsv } from "./csv-parser.js";

export const MAX_TABULAR_ROWS = 10_000;
export const MAX_TABULAR_COLUMNS = 200;

export type ParsedTabularSheet = {
  name: string;
  columns: string[];
  rowCount: number;
};

export type ParsedTabularResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  sheets: ParsedTabularSheet[];
  totalRows: number;
  truncated: boolean;
  truncatedRows: number;
  truncatedColumns: number;
};

function parseTsv(tsv: string): { columns: string[]; rows: Record<string, unknown>[] } {
  if (!tsv.trim()) {
    return { columns: [], rows: [] };
  }

  const lines = tsv.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }

  const headers = lines[0].split("\t").map((header) => header.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t");
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const rawValue = values[j]?.trim() ?? "";
      if (rawValue === "") {
        row[header] = null;
      } else if (!Number.isNaN(Number(rawValue))) {
        row[header] = Number(rawValue);
      } else {
        row[header] = rawValue;
      }
    }
    rows.push(row);
  }

  return { columns: headers, rows };
}

function normalizeRowsWithColumns(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const col of columns) {
      normalized[col] = row[col] ?? null;
    }
    return normalized;
  });
}

function toHeaderName(value: unknown, fallbackIndex: number): string {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return text || `column_${fallbackIndex + 1}`;
}

function dedupeHeaders(values: unknown[]): string[] {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = toHeaderName(value, index);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    if (seen === 0) {
      return base;
    }
    return `${base}_${seen + 1}`;
  });
}

function applyTabularLimits(params: { columns: string[]; rows: Record<string, unknown>[] }): {
  columns: string[];
  rows: Record<string, unknown>[];
  truncatedRows: number;
  truncatedColumns: number;
} {
  const limitedColumns = params.columns.slice(0, MAX_TABULAR_COLUMNS);
  const truncatedColumns = Math.max(0, params.columns.length - limitedColumns.length);
  const limitedRows = params.rows.slice(0, MAX_TABULAR_ROWS);
  const truncatedRows = Math.max(0, params.rows.length - limitedRows.length);
  return {
    columns: limitedColumns,
    rows: normalizeRowsWithColumns(limitedRows, limitedColumns),
    truncatedRows,
    truncatedColumns,
  };
}

function parseWorkbook(buffer: Buffer): ParsedTabularResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets: ParsedTabularSheet[] = [];
  const mergedRows: Record<string, unknown>[] = [];
  const mergedColumnsSet = new Set<string>();
  let truncatedRows = 0;
  let truncatedColumns = 0;
  let remainingRows = MAX_TABULAR_ROWS;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });
    const rawHeader = matrix[0] ?? [];
    const sheetColumnsAll = dedupeHeaders(rawHeader);
    const sheetColumns = sheetColumnsAll.slice(0, MAX_TABULAR_COLUMNS);
    truncatedColumns += Math.max(0, sheetColumnsAll.length - sheetColumns.length);

    const rawRows = matrix.slice(1).map((line) => {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < sheetColumns.length; i++) {
        row[sheetColumns[i]!] = line?.[i] ?? null;
      }
      return row;
    });

    const takenRows = rawRows.slice(0, Math.max(0, remainingRows));
    truncatedRows += Math.max(0, rawRows.length - takenRows.length);
    remainingRows -= takenRows.length;

    sheets.push({
      name: sheetName,
      columns: sheetColumns,
      rowCount: takenRows.length,
    });

    for (const col of sheetColumns) {
      mergedColumnsSet.add(col);
    }
    for (const row of takenRows) {
      mergedRows.push({ ...row, __sheet: sheetName });
    }
  }

  const mergedColumns = [...mergedColumnsSet];
  if (mergedRows.length > 0) {
    mergedColumns.push("__sheet");
  }

  return {
    columns: mergedColumns,
    rows: normalizeRowsWithColumns(mergedRows, mergedColumns),
    sheets,
    totalRows: mergedRows.length,
    truncated: truncatedRows > 0 || truncatedColumns > 0,
    truncatedRows,
    truncatedColumns,
  };
}

export async function parseTabularFile(params: {
  type: SessionFileType;
  filename: string;
  buffer: Buffer;
}): Promise<ParsedTabularResult> {
  const { type, buffer } = params;

  if (type === "csv") {
    const parsed = parseCsv(buffer.toString("utf-8"));
    const withSheetRows = parsed.rows.map((row) => ({ ...row, __sheet: "Sheet1" }));
    const withSheetCols = parsed.columns.length > 0 ? [...parsed.columns, "__sheet"] : [];
    const limited = applyTabularLimits({ columns: withSheetCols, rows: withSheetRows });
    return {
      columns: limited.columns,
      rows: limited.rows,
      sheets: [{ name: "Sheet1", columns: parsed.columns, rowCount: limited.rows.length }],
      totalRows: limited.rows.length,
      truncated: limited.truncatedRows > 0 || limited.truncatedColumns > 0,
      truncatedRows: limited.truncatedRows,
      truncatedColumns: limited.truncatedColumns,
    };
  }

  if (type === "tsv") {
    const parsed = parseTsv(buffer.toString("utf-8"));
    const withSheetRows = parsed.rows.map((row) => ({ ...row, __sheet: "Sheet1" }));
    const withSheetCols = parsed.columns.length > 0 ? [...parsed.columns, "__sheet"] : [];
    const limited = applyTabularLimits({ columns: withSheetCols, rows: withSheetRows });
    return {
      columns: limited.columns,
      rows: limited.rows,
      sheets: [{ name: "Sheet1", columns: parsed.columns, rowCount: limited.rows.length }],
      totalRows: limited.rows.length,
      truncated: limited.truncatedRows > 0 || limited.truncatedColumns > 0,
      truncatedRows: limited.truncatedRows,
      truncatedColumns: limited.truncatedColumns,
    };
  }

  if (type === "xlsx" || type === "xls" || type === "ods") {
    return parseWorkbook(buffer);
  }

  throw new Error(`Unsupported tabular type: ${type}`);
}
