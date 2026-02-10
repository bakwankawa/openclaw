import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv-parser.js";

describe("parseCsv", () => {
  it("parses simple CSV with headers", () => {
    const csv = "name,sales,date\nProduct A,1000,2024-01-01\nProduct B,2000,2024-01-02";
    const result = parseCsv(csv);
    expect(result.columns).toEqual(["name", "sales", "date"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: "Product A", sales: 1000, date: "2024-01-01" });
    expect(result.rows[1]).toEqual({ name: "Product B", sales: 2000, date: "2024-01-02" });
  });

  it("handles quoted values with commas", () => {
    const csv = 'name,description\n"Product A","Description, with comma"';
    const result = parseCsv(csv);
    expect(result.rows[0].description).toBe("Description, with comma");
  });

  it("detects number types", () => {
    const csv = "name,price\nProduct A,100.5\nProduct B,200";
    const result = parseCsv(csv);
    expect(typeof result.rows[0].price).toBe("number");
    expect(result.rows[0].price).toBe(100.5);
  });

  it("handles empty CSV", () => {
    const csv = "";
    const result = parseCsv(csv);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});
