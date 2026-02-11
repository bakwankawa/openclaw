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

function resolveLegacyDmScope(): HdDmScope {
  return "main";
}

function resolveBuiltInDmScope(channel?: string): HdDmScope {
  const normalized = channel?.trim().toLowerCase();
  if (normalized === "telegram" || normalized === "webchat") {
    return "per-account-channel-peer";
  }
  return "main";
}

function resolveLegacyDirectIsolationTarget(): HdIsolationTarget | undefined {
  return undefined;
}

function resolveBuiltInDirectIsolationTarget(
  input: HdIsolationInput,
): HdIsolationTarget | undefined {
  const channel = resolveBuiltInDirectIsolationChannel(input);
  if (!channel) {
    return undefined;
  }
  const peerId = resolveBuiltInDirectIsolationPeerId(input, channel);
  if (!peerId) {
    return undefined;
  }
  return { channel, peerId };
}

function resolveBuiltInDirectIsolationChannel(
  input: HdIsolationInput,
): "telegram" | "webchat" | undefined {
  const surface = input.surface?.trim().toLowerCase();
  const provider = input.provider?.trim().toLowerCase();
  const from = input.from?.trim().toLowerCase() ?? "";
  const fromPrefix = from.split(":")[0]?.trim();
  const channel = surface || provider || fromPrefix;
  if (channel === "telegram" || channel === "webchat") {
    return channel;
  }
  return undefined;
}

function resolveBuiltInDirectIsolationPeerId(
  input: HdIsolationInput,
  channel: "telegram" | "webchat",
): string | undefined {
  const sender = (input.senderId ?? "").trim().toLowerCase();
  if (sender && sender !== "unknown") {
    return sender;
  }
  const from = (input.from ?? "").trim().toLowerCase();
  if (!from || from === "unknown") {
    return undefined;
  }
  const prefix = `${channel}:`;
  if (from.startsWith(prefix)) {
    const peer = from.slice(prefix.length).trim();
    return peer && peer !== "unknown" ? peer : undefined;
  }
  return from;
}

export function resolveHdDmScope(params: { configured?: HdDmScope; channel?: string }): HdDmScope {
  if (params.configured) {
    return params.configured;
  }
  if (!shouldUseHdMemory()) {
    return resolveLegacyDmScope();
  }
  loadExternalHdMemoryAdapter();
  const custom = getActiveAdapter()?.resolveDmScope?.(params);
  if (custom) {
    return custom;
  }
  return resolveBuiltInDmScope(params.channel);
}

export function resolveHdDirectIsolationTarget(
  input: HdIsolationInput,
): HdIsolationTarget | undefined {
  if (!shouldUseHdMemory()) {
    return resolveLegacyDirectIsolationTarget();
  }
  loadExternalHdMemoryAdapter();
  const custom = getActiveAdapter()?.resolveDirectIsolationTarget?.(input);
  if (custom) {
    return custom;
  }
  return resolveBuiltInDirectIsolationTarget(input);
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
