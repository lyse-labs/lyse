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

export function isInteractive(): boolean {
  if (process.env.LYSE_YES === "1") return false;
  if (process.env.LYSE_NO_PROMPT === "1") return false;
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  return !!process.stdout.isTTY;
}
