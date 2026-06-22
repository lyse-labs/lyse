const ALIAS_RE = /^\{([^}]+)\}$/;

interface DtcgNode {
  $value?: unknown;
  [k: string]: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function flatten(node: unknown, path: string[], raw: Map<string, string>): void {
  if (!isObject(node)) return;
  const n = node as DtcgNode;
  if (typeof n.$value === "string") {
    raw.set(path.join("/"), n.$value);
    return;
  }
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith("$")) continue;
    if (isObject(v)) flatten(v, [...path, k], raw);
  }
}

function resolve(value: string, raw: Map<string, string>, seen: Set<string>): string {
  const m = ALIAS_RE.exec(value);
  if (!m || !m[1]) return value;
  const ref = m[1].replaceAll(".", "/");
  if (seen.has(ref)) return value;
  const target = raw.get(ref);
  if (target === undefined) return value;
  return resolve(target, raw, new Set([...seen, ref]));
}

export function buildDtcgCanonicalMap(dtcgJson: unknown): Map<string, string> {
  const raw = new Map<string, string>();
  if (!isObject(dtcgJson)) return raw;
  flatten(dtcgJson, [], raw);

  const resolved = new Map<string, string>();
  for (const [path, value] of raw) {
    resolved.set(path, resolve(value, raw, new Set([path])));
  }
  return resolved;
}

type Prefix = { prefix: string; namespace: string };

const PREFIXES: Prefix[] = [
  { prefix: "--transition-duration-", namespace: "motion/duration/" },
  { prefix: "--border-width-", namespace: "borderWidth/" },
  { prefix: "--font-weight-", namespace: "typography/weight/" },
  { prefix: "--font-size-", namespace: "typography/" },
  { prefix: "--breakpoint-", namespace: "breakpoints/" },
  { prefix: "--tracking-", namespace: "typography/letter-spacing/" },
  { prefix: "--leading-", namespace: "typography/line-height/" },
  { prefix: "--spacing-", namespace: "spacing/" },
  { prefix: "--opacity-", namespace: "opacity/" },
  { prefix: "--radius-", namespace: "radii/" },
  { prefix: "--shadow-", namespace: "shadows/" },
  { prefix: "--color-", namespace: "color/" },
  { prefix: "--ease-", namespace: "motion/easing/" },
  { prefix: "--z-", namespace: "zIndex/" },
];

export function cssVarToTokenPath(varName: string): string | null {
  for (const { prefix, namespace } of PREFIXES) {
    if (varName.startsWith(prefix)) {
      return namespace + varName.slice(prefix.length);
    }
  }
  return null;
}
