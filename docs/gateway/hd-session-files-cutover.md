# HD Session Files Cutover

This runbook describes how to cut over Session Files handling to the HD extension runtime while keeping fast rollback.

## Prerequisites

- Gateway already runs from source (`pnpm openclaw gateway run`).
- Session Files feature is enabled in config.
- HD extension runtime package is installed and discoverable by the Gateway process.

## Enable HD Session Files

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true
sleep 1
HD_SESSION_FILES_ENABLED=1 pnpm openclaw gateway run
```

## Verify

- Upload and query `csv`.
- Upload and query `xlsx`.
- Confirm query results from tools remain stable:
  - `session_files_query_csv`
  - `session_files_query_tabular`

## Rollback

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true
sleep 1
HD_SESSION_FILES_ENABLED=0 pnpm openclaw gateway run
```

## Notes

- Flag `HD_SESSION_FILES_ENABLED=0` uses fallback core path.
- Flag `HD_SESSION_FILES_ENABLED=1` routes query/parse calls through HD runtime adapter when available.
