import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MAX_TABULAR_ROWS, parseTabularFile } from "./tabular-parser.js";

describe("parseTabularFile", () => {
  it("parses TSV content", async () => {
    const tsv = "name\tvalue\nalpha\t1\nbeta\t2";
    const parsed = await parseTabularFile({
      type: "tsv",
      filename: "sample.tsv",
      buffer: Buffer.from(tsv, "utf-8"),
    });

    expect(parsed.columns).toEqual(["name", "value", "__sheet"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ name: "alpha", value: 1, __sheet: "Sheet1" });
  });

  it("merges multi-sheet xlsx into one table with __sheet marker", async () => {
    const workbook = XLSX.utils.book_new();
    const sheetA = XLSX.utils.json_to_sheet([{ product: "A", sales: 10 }]);
    const sheetB = XLSX.utils.json_to_sheet([{ product: "B", region: "SEA" }]);
    XLSX.utils.book_append_sheet(workbook, sheetA, "January");
    XLSX.utils.book_append_sheet(workbook, sheetB, "February");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = await parseTabularFile({
      type: "xlsx",
      filename: "sales.xlsx",
      buffer,
    });

    expect(parsed.sheets).toEqual([
      { name: "January", columns: ["product", "sales"], rowCount: 1 },
      { name: "February", columns: ["product", "region"], rowCount: 1 },
    ]);
    expect(parsed.columns).toEqual(["product", "sales", "region", "__sheet"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      product: "A",
      sales: 10,
      region: null,
      __sheet: "January",
    });
    expect(parsed.rows[1]).toEqual({
      product: "B",
      sales: null,
      region: "SEA",
      __sheet: "February",
    });
  });

  it("preserves header columns for sheets with no data rows", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["name", "amount"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "HeadersOnly");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = await parseTabularFile({
      type: "xlsx",
      filename: "headers-only.xlsx",
      buffer,
    });

    expect(parsed.sheets).toEqual([
      { name: "HeadersOnly", columns: ["name", "amount"], rowCount: 0 },
    ]);
    expect(parsed.columns).toEqual(["name", "amount"]);
    expect(parsed.rows).toEqual([]);
  });

  it("clips oversized tabular files and marks truncation metadata", async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < MAX_TABULAR_ROWS + 25; i++) {
      rows.push({ index: i, value: `v-${i}` });
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Big");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = await parseTabularFile({
      type: "xlsx",
      filename: "big.xlsx",
      buffer,
    });

    expect(parsed.rows).toHaveLength(MAX_TABULAR_ROWS);
    expect(parsed.truncated).toBe(true);
    expect(parsed.truncatedRows).toBe(25);
  });
});
