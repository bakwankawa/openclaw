/**
 * Validates that a SQL string is a read-only SELECT (or SELECT via CTE).
 * Used by the text2sql script to reject DML/DDL.
 */

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|COPY|DO|EXPLAIN|PREPARE|DEALLOCATE|SET|RESET|LISTEN|NOTIFY|VACUUM|REINDEX|CLUSTER|COMMENT|LOCK)\b/i;

export function isReadOnlySelect(sql: string): boolean {
  const trimmed = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  if (FORBIDDEN.test(trimmed)) return false;
  const upper = trimmed.toUpperCase();
  return upper.startsWith("SELECT") || upper.startsWith("WITH");
}
