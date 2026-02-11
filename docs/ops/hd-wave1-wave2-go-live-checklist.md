# HD Wave 1 + Wave 2 Go-Live Checklist

This checklist is for staged rollout of:

- Wave 1: Session Files extension routing
- Wave 2: Memory routing

## Preconditions

- Repo A (`openclaw` fork) is on the target release branch and passes:
  - `pnpm build`
  - `pnpm check`
  - `pnpm test`
- Repo B (`openclaw-hd-custom`) package branch is built and tested.
- Operators know rollback command and owner on duty is assigned.

## Stage 1: Staging Wave 1 (Session Files only)

Run:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=0 pnpm openclaw gateway run
```

Validate:

- Session file upload and parsing works for `csv/tsv/xlsx/xls/ods`.
- Query tool behavior is stable and parity checks pass for sampled files.
- No spike in parser/query failures in logs.

## Stage 2: Production Wave 1

Run same flag profile in production:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=0 pnpm openclaw gateway run
```

Validate:

- Channel behavior remains consistent (Telegram, UI, WhatsApp, others).
- Error rate and latency remain in acceptable range.

## Stage 3: Staging Wave 2 (Memory)

Enable both flags:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=1 pnpm openclaw gateway run
```

Validate:

- Session key extraction and indexing behave correctly.
- Memory search returns expected scoped results.
- No regression in existing memory sync lifecycle.

## Stage 4: Production Wave 2

Roll out the same dual-flag profile:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=1 pnpm openclaw gateway run
```

Confirm:

- No critical alerts for at least one stability window.
- Spot checks pass for both Session Files and Memory behavior.

## Fast Rollback

Disable both wave routes:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=0 HD_MEMORY_ENABLED=0 pnpm openclaw gateway run
```

## Sign-off

- [ ] Engineering owner approved
- [ ] Operations owner approved
- [ ] Rollback tested on staging
- [ ] Production monitoring in place
