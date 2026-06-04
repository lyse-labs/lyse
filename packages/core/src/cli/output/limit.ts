export function parseLimit(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new Error(`Invalid --limit value: ${raw}. Expected a non-negative integer or "all".`);
    }
    return raw === 0 ? null : raw;
  }
  if (typeof raw !== "string") {
    throw new Error(`Invalid --limit value: ${String(raw)}. Expected a non-negative integer or "all".`);
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return undefined;
  if (trimmed === "all") return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid --limit value: ${raw}. Expected a non-negative integer or "all".`);
  }
  const n = parseInt(trimmed, 10);
  return n === 0 ? null : n;
}

export function resolveLimit(
  args: { limit?: unknown; verbose?: unknown },
  defaultValue?: number | null,
): number | null | undefined {
  const explicit = parseLimit(args.limit);
  if (explicit !== undefined) return explicit;
  if (args.verbose === true) return null;
  return defaultValue;
}
