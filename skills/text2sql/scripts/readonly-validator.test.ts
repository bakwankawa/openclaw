import { describe, it, expect } from "vitest";
import { isReadOnlySelect } from "./readonly-validator";

describe("isReadOnlySelect", () => {
  it("allows simple SELECT", () => {
    expect(isReadOnlySelect("SELECT * FROM t")).toBe(true);
    expect(isReadOnlySelect("  SELECT id FROM users WHERE x = 1")).toBe(true);
  });

  it("rejects INSERT, UPDATE, DELETE, DDL", () => {
    expect(isReadOnlySelect("INSERT INTO t VALUES (1)")).toBe(false);
    expect(isReadOnlySelect("UPDATE t SET x=1")).toBe(false);
    expect(isReadOnlySelect("DELETE FROM t")).toBe(false);
    expect(isReadOnlySelect("DROP TABLE t")).toBe(false);
    expect(isReadOnlySelect("TRUNCATE t")).toBe(false);
    expect(isReadOnlySelect("SELECT * FROM t; DROP TABLE t")).toBe(false);
  });

  it("allows WITH (CTE) and rejects SQL that does not start with SELECT/WITH", () => {
    expect(isReadOnlySelect("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    expect(isReadOnlySelect("; SELECT * FROM t")).toBe(false);
  });

  it("allows lowercase SELECT", () => {
    expect(isReadOnlySelect("select * from users")).toBe(true);
  });

  it("allows comment-wrapped forbidden word (stripped before check)", () => {
    expect(isReadOnlySelect("SELECT /* DROP */ 1")).toBe(true);
  });

  it("rejects when forbidden keyword appears in string literal (validator limitation)", () => {
    expect(isReadOnlySelect("SELECT * FROM t WHERE name = 'DELETE me'")).toBe(false);
  });
});
