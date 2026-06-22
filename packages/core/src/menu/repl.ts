import { isInteractive } from "./prompts.js";
import { wizardSelect } from "../ui/wizard.js";
import { brandHeader } from "../ui/banner.js";

export type ReplActionId =
  | "audit"
  | "fix"
  | "mcp-setup"
  | "explain"
  | "bench-pack"
  | "telemetry"
  | "exit";

export interface ReplAction {
  id: ReplActionId;
  title: string;
  description: string;
}

export const REPL_ACTIONS: readonly ReplAction[] = [
  { id: "audit", title: "Run audit", description: "Scan your design system" },
  { id: "fix", title: "Apply auto-fixes", description: "Run high-confidence codemods" },
  { id: "mcp-setup", title: "Set up MCP for AI", description: "Wire Lyse into Cursor / Claude Code" },
  { id: "explain", title: "Explain a rule", description: "Show the rationale for a rule" },
  { id: "bench-pack", title: "Bench-pack", description: "Emit a deterministic evidence pack" },
  { id: "telemetry", title: "Telemetry settings", description: "View or change anonymous telemetry consent" },
  { id: "exit", title: "Exit", description: "Quit Lyse" },
];

export interface ReplContext {
  cwd: string;
  quiet: boolean;
  version: string;
}

export function renderReplBanner(ctx: ReplContext): string {
  const noColorEnv = typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== "";
  const ui = {
    color: (process.stdout.isTTY ?? false) && !noColorEnv,
    unicode: (process.stdout.isTTY ?? false) && process.platform !== "win32",
  };
  return [
    "",
    brandHeader(ctx.version, "interactive menu", ui),
    `  ${ctx.cwd}`,
    "",
    "  Tip: pass --no-menu (or set LYSE_NO_MENU=1) to skip the menu.",
    "  Or invoke a subcommand directly (lyse audit, lyse fix, …).",
    "",
  ].join("\n");
}

export async function promptForAction(): Promise<ReplActionId> {
  return wizardSelect(
    "What now?",
    REPL_ACTIONS.map((a) => ({ value: a.id, label: a.title, hint: a.description })),
    "exit",
  );
}

export type ReplDispatch = (action: ReplActionId, ctx: ReplContext) => Promise<void>;

export async function runRepl(ctx: ReplContext, dispatch: ReplDispatch): Promise<void> {
  if (!isInteractive()) return;

  process.stdout.write(renderReplBanner(ctx));

  while (true) {
    const action = await promptForAction();
    if (action === "exit") return;
    try {
      await dispatch(action, ctx);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      const exitMatch = /^__LYSE_REPL_EXIT_(-?\d+)__$/.exec(msg);
      if (exitMatch) {
        const code = exitMatch[1];
        if (code !== "0") process.stderr.write(`(action exited with code ${code})\n`);
      } else {
        process.stderr.write(`Error: ${msg}\n`);
      }
    }
    process.stdout.write("\n");
  }
}

// Some commands call process.exit() on entitlement / threshold failures. Inside
// the REPL we want those exits to abort just the current action — not kill the
// long-running menu loop. We replace process.exit with a sentinel throw for the
// duration of fn(), then restore it.
export async function withExitGuard<T>(fn: () => Promise<T>): Promise<T> {
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    throw new Error(`__LYSE_REPL_EXIT_${code ?? 0}__`);
  }) as typeof process.exit;
  try {
    return await fn();
  } finally {
    process.exit = originalExit;
  }
}
