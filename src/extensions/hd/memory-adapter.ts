export type HdSqlFilter = {
  sql: string;
  params: string[];
};

export type HdMemoryAdapter = {
  buildSessionFilter?: (params: { sessionKey?: string; tableAlias?: string }) => HdSqlFilter;
};

let adapter: HdMemoryAdapter | undefined;

export function shouldUseHdMemory(): boolean {
  return process.env.HD_MEMORY_ENABLED === "1";
}

export function setHdMemoryAdapter(next?: HdMemoryAdapter): void {
  adapter = next;
}

export function buildHdSessionFilter(params: {
  sessionKey?: string;
  tableAlias?: string;
}): HdSqlFilter {
  if (!shouldUseHdMemory()) {
    return { sql: "", params: [] };
  }

  const custom = adapter?.buildSessionFilter?.(params);
  if (custom) {
    return custom;
  }

  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return { sql: "", params: [] };
  }

  const column = params.tableAlias ? `${params.tableAlias}.session_key` : "session_key";
  return {
    sql: ` AND ${column} = ?`,
    params: [sessionKey],
  };
}
