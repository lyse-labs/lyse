# Instant audit — the bare command scans, like react-doctor — Design

**Goal:** `npx @lyse-labs/lyse` with no subcommand must produce a Health
Score immediately (react-doctor trajectory: the first command IS the
product). Today the bare command opens an interactive REPL menu on a TTY
and prints usage otherwise.

## Behavior

- **Bare `lyse` on a TTY** → runs the audit of the current directory,
  exactly as `lyse audit` (same flags accepted where they exist on the
  root command, same post-audit action menu, same exit codes).
- **Bare `lyse` non-TTY** → unchanged: prints usage. Scripts must say
  `lyse audit` (explicit machine entry points stay explicit).
- **The standalone REPL menu is retired** (`menu/repl.ts`,
  `dispatchReplAction`, the `--no-menu` flag and `LYSE_NO_MENU` env).
  The post-audit action menu already owns the interactive follow-ups;
  a second menu was dispersion. Zero-debt rule: delete, don't strand.
- **README Quickstart** becomes the bare command; `lyse init` moves to
  an "optional: calibrate & wire your agent" paragraph. A short section
  under the hero names the agent-era pain (AI agents hardcode values
  and bypass the design system) before the determinism pitch.

## Constraints

- No Health Score change. No new flags.
- Implementation: the root command's `run` delegates to the audit
  command's handler (`runCommand(auditCommand, ...)`) rather than
  duplicating audit logic.
- Changeset: minor (bare-command behavior change, REPL retirement) —
  acceptable pre-1.0; CHANGELOG documents the migration (`lyse` →
  audit; menu users → subcommands).

## Testing

- The delegation is thin glue over the already-tested audit command;
  the REPL deletion is locked by grep-level absence checks and the
  suite staying green in CI. Unit-test any extracted pure helper.
