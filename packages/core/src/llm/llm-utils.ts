/**
 * Shared helpers for the LLM stages (precision filter, governance grader,
 * maturity judge). Extracted once a third stage appeared, per the note in
 * filter-stage.ts / layer4-stage.ts.
 */

/** Parse JSON from an LLM response: fenced ```json, any fenced block, or bare. */
export function extractJson(text: string): unknown {
  const jsonFenced = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonFenced && jsonFenced[1]) return JSON.parse(jsonFenced[1].trim());
  const anyFenced = text.match(/```\s*([\s\S]*?)```/);
  if (anyFenced && anyFenced[1]) return JSON.parse(anyFenced[1].trim());
  return JSON.parse(text);
}

/** Reject a promise if it does not settle within `ms` milliseconds. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`LLM connector timeout after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
