export type HdSessionFilesAdapter = {
  extractTabularText?: (params: {
    mimeType?: string;
    filename: string;
    buffer: Buffer;
    maxChars: number;
    previewRows?: number;
  }) => Promise<string | undefined>;
};

let adapterOverride: HdSessionFilesAdapter | undefined;
let externalAdapter: HdSessionFilesAdapter | undefined;
let externalAdapterLoadPromise: Promise<void> | null = null;

export function shouldUseHdSessionFiles(): boolean {
  return process.env.HD_SESSION_FILES_ENABLED === "1";
}

export function setHdSessionFilesAdapter(next?: HdSessionFilesAdapter): void {
  adapterOverride = next;
}

export function resetHdSessionFilesAdapterCache(): void {
  externalAdapter = undefined;
  externalAdapterLoadPromise = null;
}

function toHdSessionFilesAdapter(mod: unknown): HdSessionFilesAdapter {
  const typed = mod as HdSessionFilesAdapter;
  return {
    extractTabularText:
      typeof typed?.extractTabularText === "function" ? typed.extractTabularText : undefined,
  };
}

export async function loadHdSessionFilesAdapter(
  moduleName = "@commitdulubarungopi/hd-session-files-extension",
): Promise<HdSessionFilesAdapter | undefined> {
  try {
    const mod = await import(moduleName);
    return toHdSessionFilesAdapter(mod);
  } catch {
    return undefined;
  }
}

function loadExternalHdSessionFilesAdapter(): void {
  if (externalAdapterLoadPromise) {
    return;
  }
  externalAdapterLoadPromise = loadHdSessionFilesAdapter()
    .then((adapter) => {
      externalAdapter = adapter;
    })
    .catch(() => {
      externalAdapter = undefined;
    });
}

function getActiveAdapter(): HdSessionFilesAdapter | undefined {
  return adapterOverride ?? externalAdapter;
}

async function getActiveAdapterAsync(): Promise<HdSessionFilesAdapter | undefined> {
  if (adapterOverride) {
    return adapterOverride;
  }
  loadExternalHdSessionFilesAdapter();
  if (externalAdapterLoadPromise) {
    await externalAdapterLoadPromise;
  }
  return getActiveAdapter();
}

export async function extractHdTabularText(params: {
  mimeType?: string;
  filename: string;
  buffer: Buffer;
  maxChars: number;
  previewRows?: number;
}): Promise<string | undefined> {
  if (!shouldUseHdSessionFiles()) {
    return undefined;
  }
  const adapter = await getActiveAdapterAsync();
  if (!adapter?.extractTabularText) {
    return undefined;
  }
  try {
    return await adapter.extractTabularText({
      mimeType: params.mimeType,
      filename: params.filename,
      buffer: params.buffer,
      maxChars: params.maxChars,
      previewRows: params.previewRows,
    });
  } catch {
    return undefined;
  }
}
