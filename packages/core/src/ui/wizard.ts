import { intro, outro, note, confirm, select, spinner, isCancel, cancel } from "@clack/prompts";
import { isInteractive } from "../menu/prompts.js";

export function wizardIntro(title: string): void {
  if (isInteractive()) {
    intro(title);
  } else {
    console.log(`\n${title}\n`);
  }
}

export function wizardOutro(message: string): void {
  if (isInteractive()) {
    outro(message);
  } else {
    console.log(message);
  }
}

export function wizardNote(body: string, title?: string): void {
  if (isInteractive()) {
    if (title === undefined) note(body);
    else note(body, title);
  } else if (title === undefined) {
    console.log(body);
  } else {
    console.log(`${title}\n${body}`);
  }
}

export async function wizardConfirm(message: string, defaultValue = true): Promise<boolean> {
  if (!isInteractive()) return defaultValue;
  const answer = await confirm({ message, initialValue: defaultValue });
  if (isCancel(answer)) {
    cancel("Aborted.");
    return false;
  }
  return answer;
}

export async function wizardTask<T>(startLabel: string, stopLabel: string, fn: () => Promise<T>): Promise<T> {
  if (!isInteractive()) {
    console.log(startLabel);
    return fn();
  }
  const s = spinner();
  s.start(startLabel);
  try {
    const out = await fn();
    s.stop(stopLabel);
    return out;
  } catch (err) {
    s.stop(`${stopLabel} — failed`);
    throw err;
  }
}

export async function wizardSelect<T extends string>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
  defaultValue?: T,
): Promise<T> {
  const fallback = defaultValue ?? options[0]?.value;
  if (fallback === undefined) {
    throw new Error("wizardSelect requires at least one option");
  }
  if (!isInteractive()) return fallback;
  const clackOptions = options.map((o) => {
    const opt: { value: T; label: string; hint?: string } = { value: o.value, label: o.label };
    if (o.hint !== undefined) {
      opt.hint = o.hint;
    }
    return opt;
  });
  const answer = await select({
    message,
    options: clackOptions as Parameters<typeof select>[0]["options"],
    initialValue: fallback,
  });
  if (isCancel(answer)) {
    cancel("Aborted.");
    return fallback;
  }
  return answer as T;
}
