export function shouldUseHdSessionFiles(): boolean {
  return process.env.HD_SESSION_FILES_ENABLED === "1";
}
