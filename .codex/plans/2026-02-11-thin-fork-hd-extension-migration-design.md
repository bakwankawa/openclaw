# Thin Fork + HD Extension Migration Design

## Summary

This design defines how to transition from a heavily customized fork to a sustainable two-repo model:

1. `openclaw-fork` remains close to upstream (`openclaw/openclaw`) and acts as runtime host.
2. `openclaw-hd-custom` contains custom business logic as extension packages.

The first migration waves are intentionally limited to:

- Wave 1: Session Files (`xlsx/csv/query/tooling`)
- Wave 2: Memory (`session_key/index/search`)

Jira and Text2SQL are explicitly out of scope for this phase.

## Goals

- Minimize long-term merge conflicts with upstream OpenClaw.
- Keep production runtime stable while moving logic incrementally.
- Maintain rollback capability at any time during migration.
- Preserve existing behavior for Telegram, UI, WhatsApp, and other channels.

## Non-Goals

- No big-bang rewrite.
- No migration of Jira/Text2SQL in this phase.
- No changes to release/publish processes beyond what is needed for extension loading.

## Repositories and Responsibilities

### Repo A: `openclaw-fork` (thin fork)

Purpose:

- Track `upstream/main` as closely as possible.
- Provide minimal extension wiring and fallback logic.
- Run gateway/CLI exactly as today.

Allowed custom code:

- Adapter interfaces.
- Feature-flag routing.
- Temporary compatibility bridges.

Disallowed custom code:

- Domain-heavy business logic for Session Files and Memory.

### Repo B: `openclaw-hd-custom`

Purpose:

- Host all HD-specific custom behavior.
- Version and test custom extensions independently.

Initial packages:

- `packages/hd-session-files-extension`
- `packages/hd-memory-extension`

## Runtime Model

Gateway start command remains the same operationally:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true
HD_SESSION_FILES_ENABLED=1 pnpm openclaw gateway run
```

Feature flags:

- `HD_SESSION_FILES_ENABLED` (`0`/`1`)
- `HD_MEMORY_ENABLED` (`0`/`1`, introduced in Wave 2)

Behavior:

- Flag `0`: use core/fallback implementation in Repo A.
- Flag `1`: route to extension implementation from Repo B.

Fast rollback:

```bash
HD_SESSION_FILES_ENABLED=0 HD_MEMORY_ENABLED=0 pnpm openclaw gateway run
```

## Migration Strategy

### Phase 0: Foundation

- Create `openclaw-hd-custom`.
- Bootstrap extension package structure.
- Add extension loading contracts and flags in `openclaw-fork`.
- Confirm no behavior changes when all flags are `0`.

### Phase 1: Session Files (Wave 1)

Scope:

- Tabular parsing for `csv/tsv/xlsx/xls/ods`.
- Query tooling integration.
- Session file storage metadata and parsing behavior.
- Channel-agnostic behavior consistency (Telegram/UI/WA/etc).

Primary source files to migrate from legacy custom branch (`dev`) into extension design:

- `src/sessions/files/tabular-parser.ts`
- `src/sessions/files/storage.ts`
- `src/sessions/files/types.ts`
- `src/sessions/files/index.ts`
- `src/sessions/files/csv-query.ts`
- `src/agents/tools/session-files-tool.ts`
- `src/auto-reply/reply/session-files.ts`
- `src/media/input-files.ts`
- `src/media-understanding/apply.ts`

Validation tests:

- `src/sessions/files/tabular-parser.test.ts`
- `src/sessions/files/storage.test.ts`
- `src/agents/tools/session-files-tool.test.ts`
- `src/auto-reply/reply/session-files-telegram-flow.test.ts`

Cutover:

- Enable `HD_SESSION_FILES_ENABLED=1` in staging.
- Validate parity vs fallback behavior.
- Promote to production gradually.

### Phase 2: Memory (Wave 2)

Scope:

- Session key extraction.
- Session-scoped indexing/search.
- Memory schema compatibility.

Primary source files:

- `src/memory/extract-session-key.ts`
- `src/memory/manager.ts`
- `src/memory/manager-search.ts`
- `src/memory/memory-schema.ts`

Validation tests:

- `src/memory/extract-session-key.test.ts`
- `src/memory/memory-schema.test.ts`

Cutover:

- Enable `HD_MEMORY_ENABLED=1` in staging.
- Validate search/index parity and correctness.
- Promote after stability window.

## Compatibility and Data Safety

- Existing session files and indexes must remain readable.
- Backward compatibility for parsed metadata fields must be preserved.
- No destructive migrations in first rollout.
- All extension contracts should preserve current response shape.

## Rollout and Monitoring

Environment progression:

1. Local dev
2. Staging
3. Production (gradual enablement)

Operational checks:

- Parse success/error rates by file type.
- Query result parity checks for sampled requests.
- Memory index/search correctness by session key.
- Alert on regression spikes after flag enablement.

## Risks and Mitigations

Risk: Behavior drift between fallback and extension.
Mitigation: Run parity-focused tests and staged rollout with quick flag rollback.

Risk: Scope creep during migration.
Mitigation: Strict allowlist of files and domains per wave.

Risk: Upstream changes affecting integration points.
Mitigation: Keep Repo A thin and rebase frequently on upstream.

## Acceptance Criteria

- `main` in fork remains aligned with upstream process and only minimal custom wiring.
- Session Files behavior runs through extension with no critical regressions.
- Memory session_key/index/search runs through extension with validated parity.
- Rollback by feature flags works without code rollback.
- Jira/Text2SQL remains untouched in this migration phase.

## Execution Plan (Day-by-Day)

Day 1:

- Foundation wiring and flags (`HD_SESSION_FILES_ENABLED`).

Day 2-3:

- Session Files extraction and parity tests.

Day 4:

- Session Files staging validation and controlled cutover.

Day 5-6:

- Memory extraction, tests, and staging validation.

Day 7:

- Memory cutover + cleanup of obsolete custom code paths.

## Operator Runbook (Current vs Target)

Current command remains valid and should continue to be used:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && pnpm openclaw gateway run
```

Target command during migration should include flags:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=0 pnpm openclaw gateway run
```

After Wave 2 completion:

```bash
lsof -ti:18789 | xargs kill -9 2>&1 || true && sleep 1 && HD_SESSION_FILES_ENABLED=1 HD_MEMORY_ENABLED=1 pnpm openclaw gateway run
```
