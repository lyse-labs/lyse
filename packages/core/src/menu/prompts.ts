import prompts from "prompts";

export async function confirm(message: string, defaultYes: boolean = true): Promise<boolean> {
  if (!isInteractive()) return defaultYes;
  const r = await prompts({ type: "confirm", name: "v", message, initial: defaultYes });
  return r.v as boolean;
}

export async function choice<T extends string>(
  message: string,
  choices: { title: string; value: T; description?: string }[],
  defaultValue?: T
): Promise<T> {
  if (!isInteractive()) {
    return defaultValue ?? choices[0]!.value;
  }
  const r = await prompts({
    type: "select",
    name: "v",
    message,
    choices: choices.map(c => ({ title: c.title, value: c.value, description: c.description })),
    initial: defaultValue ? choices.findIndex(c => c.value === defaultValue) : 0,
  });
  return r.v as T;
}

/**
 * Confirmation gate for an action that skips a normal safety check (e.g.
 * spawning an agent with permission prompts bypassed). Unlike `confirm()`,
 * the two "default" concepts are deliberately decoupled:
 *
 * - Shown on a real TTY: defaults to **no** (`initial: false`) — the user
 *   must explicitly opt in.
 * - Not interactive (no TTY, `CI`, `--yes`, `--no-prompt`): the prompt is
 *   skipped entirely and this **proceeds** (`true`) — those signals mean the
 *   caller already asked not to be blocked, and the outer command flow
 *   already gated on having consent to run at all.
 */
export async function confirmBypass(message: string): Promise<boolean> {
  if (!isInteractive()) return true;
  const r = await prompts({ type: "confirm", name: "v", message, initial: false });
  return (r.v as boolean | undefined) ?? false;
}

export function isInteractive(): boolean {
  if (process.env.LYSE_YES === "1") return false;
  if (process.env.LYSE_NO_PROMPT === "1") return false;
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  return !!process.stdout.isTTY;
}
