export type HdSqlFilter = {
  sql: string;
  params: string[];
};

export type HdDmScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";

export type HdIsolationInput = {
  surface?: string;
  provider?: string;
  from?: string;
  senderId?: string;
};

export type HdIsolationTarget = {
  channel: "telegram" | "webchat";
  peerId: string;
};

export type HdMemoryAdapter = {
  buildSessionFilter?: (params: { sessionKey?: string; tableAlias?: string }) => HdSqlFilter;
  resolveDmScope?: (params: { configured?: HdDmScope; channel?: string }) => HdDmScope;
  resolveDirectIsolationTarget?: (input: HdIsolationInput) => HdIsolationTarget | undefined;
};

let adapterOverride: HdMemoryAdapter | undefined;
let externalAdapter: HdMemoryAdapter | undefined;
let externalAdapterLoadPromise: Promise<void> | null = null;

export function shouldUseHdMemory(): boolean {
  return process.env.HD_MEMORY_ENABLED === "1";
}

export function setHdMemoryAdapter(next?: HdMemoryAdapter): void {
  adapterOverride = next;
}

function toHdMemoryAdapter(mod: unknown): HdMemoryAdapter {
  const typed = mod as HdMemoryAdapter;
  return {
    buildSessionFilter:
      typeof typed?.buildSessionFilter === "function" ? typed.buildSessionFilter : undefined,
    resolveDmScope: typeof typed?.resolveDmScope === "function" ? typed.resolveDmScope : undefined,
    resolveDirectIsolationTarget:
      typeof typed?.resolveDirectIsolationTarget === "function"
        ? typed.resolveDirectIsolationTarget
        : undefined,
  };
}

export async function loadHdMemoryAdapter(
  moduleName = "@commitdulubarungopi/hd-memory-extension",
): Promise<HdMemoryAdapter | undefined> {
  try {
    const mod = await import(moduleName);
    return toHdMemoryAdapter(mod);
  } catch {
    return undefined;
  }
}

export function resetHdMemoryAdapterCache(): void {
  externalAdapter = undefined;
  externalAdapterLoadPromise = null;
}

function loadExternalHdMemoryAdapter(): void {
  if (externalAdapterLoadPromise) {
    return;
  }
  externalAdapterLoadPromise = loadHdMemoryAdapter()
    .then((adapter) => {
      externalAdapter = adapter;
    })
    .catch(() => {
      externalAdapter = undefined;
    });
}

function getActiveAdapter(): HdMemoryAdapter | undefined {
  return adapterOverride ?? externalAdapter;
}

function resolveFallbackDmScope(channel?: string): HdDmScope {
  void channel;
  return "main";
}

function resolveFallbackDirectIsolationTarget(
  input: HdIsolationInput,
): HdIsolationTarget | undefined {
  void input;
  return undefined;
}

export function resolveHdDmScope(params: { configured?: HdDmScope; channel?: string }): HdDmScope {
  if (params.configured) {
    return params.configured;
  }
  if (!shouldUseHdMemory()) {
    return resolveFallbackDmScope(params.channel);
  }
  loadExternalHdMemoryAdapter();
  const custom = getActiveAdapter()?.resolveDmScope?.(params);
  if (custom) {
    return custom;
  }
  return resolveFallbackDmScope(params.channel);
}

export function resolveHdDirectIsolationTarget(
  input: HdIsolationInput,
): HdIsolationTarget | undefined {
  if (!shouldUseHdMemory()) {
    return resolveFallbackDirectIsolationTarget(input);
  }
  loadExternalHdMemoryAdapter();
  const custom = getActiveAdapter()?.resolveDirectIsolationTarget?.(input);
  if (custom) {
    return custom;
  }
  return resolveFallbackDirectIsolationTarget(input);
}

export function buildHdSessionFilter(params: {
  sessionKey?: string;
  tableAlias?: string;
}): HdSqlFilter {
  if (!shouldUseHdMemory()) {
    return { sql: "", params: [] };
  }

  loadExternalHdMemoryAdapter();
  const custom = getActiveAdapter()?.buildSessionFilter?.(params);
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
