import { describe, it, expect } from "vitest";
import type { CsvQueryFilter } from "./types.js";
import { queryCsv } from "./csv-query.js";

describe("queryCsv", () => {
  const rows = [
    { name: "Product A", sales: 1000, date: "2024-01-01" },
    { name: "Product B", sales: 2000, date: "2024-01-02" },
    { name: "Product C", sales: 500, date: "2024-01-03" },
  ];
  const columns = ["name", "sales", "date"];

  it("returns all rows without filter", () => {
    const result = queryCsv({ rows, columns });
    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it("filters by equality", () => {
    const filter: CsvQueryFilter = { column: "name", operator: "eq", value: "Product A" };
    const result = queryCsv({ rows, columns, filter });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Product A");
  });

  it("filters by greater than", () => {
    const filter: CsvQueryFilter = { column: "sales", operator: "gt", value: 1000 };
    const result = queryCsv({ rows, columns, filter });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].sales).toBe(2000);
  });

  it("filters by contains", () => {
    const filter: CsvQueryFilter = { column: "name", operator: "contains", value: "Product" };
    const result = queryCsv({ rows, columns, filter });
    expect(result.rows).toHaveLength(3);
  });

  it("limits results", () => {
    const result = queryCsv({ rows, columns, limit: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("selects specific columns", () => {
    const result = queryCsv({ rows, columns, selectColumns: ["name", "sales"] });
    expect(result.rows[0]).toEqual({ name: "Product A", sales: 1000 });
    expect(result.columns).toEqual(["name", "sales"]);
  });
});
