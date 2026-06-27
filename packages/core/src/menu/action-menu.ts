import { isInteractive } from "./prompts.js";
import { wizardSelect } from "../ui/wizard.js";

export type MenuChoice = "handoff" | "mcp-setup" | "exit";

export interface MenuContext {
  findingsCount: number;
  detectedIDE: boolean;
}

export async function showActionMenu(ctx: MenuContext): Promise<MenuChoice> {
  if (!isInteractive()) return "exit";

  const choices: { title: string; value: MenuChoice }[] = [];
  if (ctx.findingsCount > 0) {
    choices.push({ title: `Hand off ${ctx.findingsCount} findings to your agent`, value: "handoff" });
  }
  if (ctx.detectedIDE) {
    choices.push({ title: "Wire into Cursor / Claude Code", value: "mcp-setup" });
  }
  choices.push({ title: "Exit", value: "exit" });

  return await wizardSelect(
    "What now?",
    choices.map((c) => ({ value: c.value, label: c.title })),
    ctx.findingsCount > 0 ? "handoff" : "exit",
  );
}
