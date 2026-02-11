export function shouldUseHdMemory(): boolean {
  return process.env.HD_MEMORY_ENABLED === "1";
}
