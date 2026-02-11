export type HdSessionFilesRuntime = {
  getParsedCsv(params: {
    sessionId: string;
    agentId?: string;
    fileId: string;
  }): Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
  getParsedTabular(params: {
    sessionId: string;
    agentId?: string;
    fileId: string;
  }): Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
};

export function getHdSessionFilesRuntime(): HdSessionFilesRuntime | null {
  return null;
}
