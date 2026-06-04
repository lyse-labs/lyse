# Troubleshooting

Common errors and how to resolve them. If your issue isn't here, open a [bug report](https://github.com/lyse-labs/lyse/issues/new/choose).

## Installation issues

### `npx: command not found`

`npx` ships with Node.js (npm 5.2+). Install Node.js 22 or later from [nodejs.org](https://nodejs.org/) or via [`nvm`](https://github.com/nvm-sh/nvm).

### `EACCES: permission denied` during install

Don't `sudo npm install -g`. Instead use `nvm` or set the npm prefix to a user-owned directory:

```bash
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### `Cannot find module 'lyse'` after install

You installed `lyse` globally but `npx` is picking up a different version. Run with explicit version:

```bash
npx @lyse-labs/lyse@latest audit .
```

Or skip global install entirely — `npx` will fetch and cache automatically.

## Audit issues

### `Error: Cannot find module '@your-org/ui'`

Your `.lyse.yaml` references a `componentsModule` that isn't installed in the current project.

Solutions:
- Run `lyse audit` from a directory where `@your-org/ui` is installed.
- Use a relative path: `componentsModule: "./packages/ui/src"`.
- Remove `componentsModule` to skip the `components/no-native-shadows` rule.

### `Error: Failed to parse <file>`

Lyse's parser failed on a file. Most likely:

- The file uses syntax newer than Lyse supports (run with `LYSE_DEBUG=1` to see the parser error).
- The file is a `.ts` file with experimental decorators or other non-default syntax.

Workarounds:
- Exclude the file: `excludePaths: ["path/to/file.ts"]` in `.lyse.yaml`.
- Open an issue with the file content (or a minimal repro).

### Score is 0 and there are no findings

The audit ran but found nothing to score. Possible causes:

- No files matched (check `includePaths` / `excludePaths`).
- All axes are N/A (no relevant code).

Run with `LYSE_DEBUG=1` to see which files were scanned.

### Score is unexpectedly low

Likely causes:

1. **Component module not configured.** If `components/no-native-shadows` can't resolve `componentsModule`, no findings fire on its axis. With fewer active axes pulling the mean down, the remaining ones swing the score.
2. **No Storybook setup.** If `stories/coverage` runs but finds no story files, the axis tanks. Either add stories or disable the rule.
3. **Lots of hardcoded colors / px values.** Check the per-axis breakdown: `lyse audit --format=json | jq '.axes'`.

### Score is unexpectedly high

Probably:

- Files you expected to be scanned are in `excludePaths`.
- Rules are accidentally disabled in `.lyse.yaml`.
- The `--rules` flag is restricting to a narrow set.

Run `lyse audit --format=json` and inspect `meta.rulesEnabled` and `meta.filesScanned`.

## Configuration issues

### `.lyse.yaml` is ignored

Check:

1. The file is named exactly `.lyse.yaml` (not `.lyse.yml`, not `lyse.config.yaml`).
2. It's in the current directory or a parent directory walked up to the git root.
3. There's no `--config` flag overriding it on the command line.

Run with `LYSE_DEBUG=1` — it will print the resolved config path.

### `Invalid config: <path>`

Lyse validates `.lyse.yaml` against a JSON Schema. The error message names the invalid key and the expected shape.

Validate independently:

```bash
npx ajv-cli validate -s schemas/v1/lyse-config.json -d .lyse.yaml
```

Or wire the schema into your editor (see [`configuration.md`](./configuration.md) → "Validating your config").

## CI / SARIF upload issues

### SARIF upload fails with "Resource not accessible by integration"

Add `security-events: write` to the workflow `permissions:` block.

If still failing, the org may have disabled code scanning for the repo. Ask an admin to enable Security & Analysis → Code scanning.

### CI score is different from local

Most common cause: different Node.js version. Pin the same version in your workflow and your local environment:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22   # match local
```

Less common: working directory mismatch. Check `working-directory` matches your local invocation.

## MCP server issues

### My IDE doesn't see the Lyse tools

Check:

1. The MCP config file (`.cursor/mcp.json` or `.mcp.json`) exists at the project root.
2. The command (`npx -y lyse mcp`) works from a terminal in the same directory.
3. You restarted the IDE after adding the config.
4. The IDE's MCP logs (Cursor: View → Output → MCP) show `lyse` as connected.

### `audit_file` returns no findings on a file you expect to fail

Possible causes:

- The file is in `excludePaths`.
- The file extension isn't supported (Lyse currently parses `.tsx`, `.jsx`, `.ts`, `.js`, `.css`, `.scss`).
- The agent passed a stale `content` parameter.

Test independently:

```bash
lyse audit path/to/file.tsx --format=json
```

If the CLI reports findings but MCP doesn't, file an issue.

### MCP server is slow

Latency budget: < 200 ms per call for files under 1000 lines.

If consistently slower:
- Set `LYSE_DEBUG=1` in your IDE's MCP env and check the logs.
- Check that your project doesn't have an enormous `componentsModule` (Lyse parses it for `components/no-native-shadows`).

### `suggest_fix` returns "no fix available"

The rule isn't auto-fixable. Currently only these are:
- `tokens/no-hardcoded-color`
- `tokens/no-hardcoded-spacing`
- `components/no-native-shadows`
- `naming/component-pascalcase`
- `naming/hook-prefix`

For other rules, the agent should ask the human or suggest a manual fix.

## Output format issues

### JSON output is empty

Either the audit found nothing, or stdout was closed before output flushed. Test:

```bash
lyse audit --format=json --output=lyse.json
```

If `lyse.json` has content but stdout was empty, your shell may be closing the pipe prematurely.

### SARIF file fails to upload to GitHub Security tab

Validate the SARIF locally:

```bash
npx sarif-multitool validate lyse-report/lyse.sarif
```

If validation passes but GitHub rejects it, [open an issue](https://github.com/lyse-labs/lyse/issues/new/choose) with the file attached.

### Terminal output has no colors

You may have set `NO_COLOR=1` or `--no-color`. Or your terminal doesn't support ANSI. Most modern terminals do.

In CI logs, color codes are stripped automatically (Lyse detects `CI=1`).

## License entitlement issues

### "License JWT verification failed"

The JWT signature didn't verify against the embedded public key. Causes:

- The JWT is corrupted or truncated. Re-copy it from your license portal.
- The JWT was issued for a different Lyse version (rare; Lyse maintains backward compatibility).
- You're on an offline machine and the JWT expired. License JWTs are valid for 1 year; they don't need network access to verify.

## Performance issues

### Audit takes > 30 seconds on a 5000-file repo

Likely causes:

1. `componentsModule` resolution is slow (the module has many exports).
2. CSS-in-JS parsing is slow (Babel is the fallback parser; expensive).
3. Lots of `node_modules/` content being scanned (check default excludes).

Workarounds:

- Set `includePaths` to your source directories only.
- Add patterns to `excludePaths`.
- Run with `LYSE_DEBUG=1` and check per-rule timings.

If you can't get under 30s on a reasonably-sized project, file a performance issue with a flame graph (Node 22 has `--prof` built-in).

### MCP `audit_file` slows down the IDE

The MCP server should be sub-200ms per call. If your IDE feels sluggish:

- Check the LSP / MCP server isn't being called too aggressively.
- Some IDEs call `audit_file` on every keystroke; ask in the IDE's settings if there's a debounce.

## Reporting bugs

When in doubt, run with `LYSE_DEBUG=1` and include the output in your bug report.

The minimum useful bug report includes:

- Lyse version (`lyse --version`)
- Node version (`node --version`)
- Operating system
- Minimal reproduction (ideally a public repo)
- Expected vs actual behavior
- Logs with `LYSE_DEBUG=1`

[File a bug report →](https://github.com/lyse-labs/lyse/issues/new/choose)
