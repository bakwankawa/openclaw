import type { CsvQueryFilter, CsvQueryResult } from "./types.js";

export function queryCsv(params: {
  rows: Record<string, unknown>[];
  columns: string[];
  filter?: CsvQueryFilter;
  limit?: number;
  selectColumns?: string[];
}): CsvQueryResult {
  const { rows, columns, filter, limit, selectColumns } = params;
  let filtered = rows;

  if (filter) {
    filtered = rows.filter((row) => {
      const value = row[filter.column];
      switch (filter.operator) {
        case "eq":
          return value === filter.value;
        case "gt":
          return typeof value === "number" && value > (filter.value as number);
        case "lt":
          return typeof value === "number" && value < (filter.value as number);
        case "gte":
          return typeof value === "number" && value >= (filter.value as number);
        case "lte":
          return typeof value === "number" && value <= (filter.value as number);
        case "contains":
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        case "startsWith":
          return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
        case "endsWith":
          return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase());
        default:
          return true;
      }
    });
  }

  const total = filtered.length;
  const limited = limit ? filtered.slice(0, limit) : filtered;

  let resultRows = limited;
  let resultColumns = columns;

  if (selectColumns) {
    resultColumns = selectColumns.filter((col) => columns.includes(col));
    resultRows = limited.map((row) => {
      const selected: Record<string, unknown> = {};
      for (const col of resultColumns) {
        selected[col] = row[col];
      }
      return selected;
    });
  }

  return {
    rows: resultRows,
    total,
    columns: resultColumns,
  };
}
