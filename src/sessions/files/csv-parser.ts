type CsvParseResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export function parseCsv(csv: string): CsvParseResult {
  if (!csv.trim()) {
    return { columns: [], rows: [] };
  }

  const lines = csv.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }

  // Simple CSV parser (handles quoted values)
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      let value: unknown = values[j] ?? "";
      // Remove quotes if present
      if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      // Try to infer type
      if (value === "") {
        value = null;
      } else if (!isNaN(Number(value)) && value !== "") {
        value = Number(value);
      }
      row[header] = value;
    }
    rows.push(row);
  }

  return { columns: headers, rows };
}
