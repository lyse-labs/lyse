import { choice, isInteractive } from "./prompts.js";

export type MenuChoice = "fix" | "mcp-setup" | "exit";

export interface MenuContext {
  autoFixableCount: number;
  detectedIDE: boolean;
}

export async function showActionMenu(ctx: MenuContext): Promise<MenuChoice> {
  if (!isInteractive()) return "exit";

  const choices: { title: string; value: MenuChoice }[] = [];
  if (ctx.autoFixableCount > 0) {
    choices.push({ title: `Auto-fix ${ctx.autoFixableCount} high-confidence findings`, value: "fix" });
  }
  if (ctx.detectedIDE) {
    choices.push({ title: "Wire into Cursor / Claude Code", value: "mcp-setup" });
  }
  choices.push({ title: "Exit", value: "exit" });

  return await choice("What now?", choices, ctx.autoFixableCount > 0 ? "fix" : "exit");
}
