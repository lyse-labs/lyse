import type {
  DtcgDocument,
  DtcgGroup,
  DtcgToken,
  DtcgType,
} from "./dtcg-model.js";
import { isDtcgAlias, isDtcgGroup, isDtcgToken } from "./dtcg-model.js";

type NormalizerSource =
  | "tailwind-v3"
  | "tailwind-v4"
  | "css-vars"
  | "theme-ts"
  | "dtcg";

export interface NormalizerInput {
  source: NormalizerSource;
  data: unknown;
}

export interface NormalizedTokens {
  document: DtcgDocument;
  source: NormalizerSource;
  warnings: string[];
}

function ensureGroup(parent: DtcgGroup, key: string): DtcgGroup {
  const existing = parent[key];
  if (existing && isDtcgGroup(existing)) return existing;
  const group: DtcgGroup = {};
  parent[key] = group;
  return group;
}

function setToken(parent: DtcgGroup, key: string, token: DtcgToken<unknown>) {
  parent[key] = token as unknown as DtcgGroup;
}

function setAt(doc: DtcgGroup, path: string[], token: DtcgToken<unknown>) {
  if (path.length === 0) return;
  let cur: DtcgGroup = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (segment === undefined) return;
    cur = ensureGroup(cur, segment);
  }
  const leaf = path[path.length - 1];
  if (leaf === undefined) return;
  setToken(cur, leaf, token);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface TailwindV3Config {
  theme?: {
    colors?: Record<string, unknown>;
    spacing?: Record<string, unknown>;
    fontSize?: Record<string, unknown>;
    fontWeight?: Record<string, unknown>;
    lineHeight?: Record<string, unknown>;
    letterSpacing?: Record<string, unknown>;
    borderRadius?: Record<string, unknown>;
    boxShadow?: Record<string, unknown>;
    transitionDuration?: Record<string, unknown>;
    transitionTimingFunction?: Record<string, unknown>;
    screens?: Record<string, unknown>;
    zIndex?: Record<string, unknown>;
    opacity?: Record<string, unknown>;
    borderWidth?: Record<string, unknown>;
  };
}

function flattenTailwindColors(
  input: Record<string, unknown>,
  prefix: string[],
): { path: string[]; value: string }[] {
  const out: { path: string[]; value: string }[] = [];
  for (const [k, v] of Object.entries(input)) {
    const path = [...prefix, k];
    if (typeof v === "string") out.push({ path, value: v });
    else if (isPlainObject(v)) out.push(...flattenTailwindColors(v, path));
  }
  return out;
}

function normalizeTailwindV3(
  config: TailwindV3Config,
  warnings: string[],
): DtcgDocument {
  const doc: DtcgDocument = {};

  if (config.theme?.colors) {
    const color = ensureGroup(doc, "color");
    for (const { path, value } of flattenTailwindColors(config.theme.colors, [])) {
      setAt(color, path, { $value: value, $type: "color" });
    }
  }

  if (config.theme?.spacing) {
    const spacing = ensureGroup(doc, "spacing");
    for (const [k, v] of Object.entries(config.theme.spacing)) {
      if (typeof v === "string") {
        setToken(spacing, k, { $value: v, $type: "dimension" });
      }
    }
  }

  if (config.theme?.fontSize) {
    const fontSize = ensureGroup(doc, "fontSize");
    for (const [k, v] of Object.entries(config.theme.fontSize)) {
      let size: string | null = null;
      if (typeof v === "string") size = v;
      else if (Array.isArray(v) && typeof v[0] === "string") size = v[0];
      else if (isPlainObject(v) && typeof v.size === "string") size = v.size;
      if (size) setToken(fontSize, k, { $value: size, $type: "dimension" });
      else warnings.push(`tailwind-v3: cannot infer fontSize for "${k}"`);
    }
  }

  if (config.theme?.fontWeight) {
    const fw = ensureGroup(doc, "fontWeight");
    for (const [k, v] of Object.entries(config.theme.fontWeight)) {
      if (typeof v === "string" || typeof v === "number") {
        setToken(fw, k, { $value: v, $type: "fontWeight" });
      }
    }
  }

  if (config.theme?.lineHeight) {
    const lh = ensureGroup(doc, "lineHeight");
    for (const [k, v] of Object.entries(config.theme.lineHeight)) {
      if (typeof v === "string" || typeof v === "number") {
        setToken(lh, k, { $value: v, $type: "number" });
      }
    }
  }

  if (config.theme?.letterSpacing) {
    const ls = ensureGroup(doc, "letterSpacing");
    for (const [k, v] of Object.entries(config.theme.letterSpacing)) {
      if (typeof v === "string") setToken(ls, k, { $value: v, $type: "dimension" });
    }
  }

  if (config.theme?.borderRadius) {
    const radius = ensureGroup(doc, "radius");
    for (const [k, v] of Object.entries(config.theme.borderRadius)) {
      if (typeof v === "string") setToken(radius, k, { $value: v, $type: "dimension" });
      else if (isPlainObject(v)) {
        const sub = ensureGroup(radius, k);
        for (const [sk, sv] of Object.entries(v)) {
          if (typeof sv === "string") setToken(sub, sk, { $value: sv, $type: "dimension" });
        }
      }
    }
  }

  if (config.theme?.boxShadow) {
    const shadow = ensureGroup(doc, "shadow");
    for (const [k, v] of Object.entries(config.theme.boxShadow)) {
      if (typeof v === "string") setToken(shadow, k, { $value: v, $type: "shadow" });
    }
  }

  if (config.theme?.transitionDuration) {
    const dur = ensureGroup(doc, "duration");
    for (const [k, v] of Object.entries(config.theme.transitionDuration)) {
      if (typeof v === "string") setToken(dur, k, { $value: v, $type: "duration" });
    }
  }

  if (config.theme?.transitionTimingFunction) {
    const ease = ensureGroup(doc, "easing");
    for (const [k, v] of Object.entries(config.theme.transitionTimingFunction)) {
      if (typeof v === "string") setToken(ease, k, { $value: v, $type: "cubicBezier" });
    }
  }

  if (config.theme?.screens) {
    const bp = ensureGroup(doc, "breakpoint");
    for (const [k, v] of Object.entries(config.theme.screens)) {
      let value: string | null = null;
      if (typeof v === "string") value = v;
      else if (isPlainObject(v)) {
        if (typeof v.min === "string") value = v.min;
        else if (typeof v.max === "string") value = v.max;
      }
      if (value) setToken(bp, k, { $value: value, $type: "dimension" });
      else warnings.push(`tailwind-v3: cannot infer breakpoint for "${k}"`);
    }
  }

  if (config.theme?.zIndex) {
    const z = ensureGroup(doc, "zIndex");
    for (const [k, v] of Object.entries(config.theme.zIndex)) {
      if (typeof v === "string" || typeof v === "number") {
        setToken(z, k, { $value: v, $type: "number" });
      }
    }
  }

  if (config.theme?.opacity) {
    const o = ensureGroup(doc, "opacity");
    for (const [k, v] of Object.entries(config.theme.opacity)) {
      if (typeof v === "string" || typeof v === "number") {
        setToken(o, k, { $value: v, $type: "number" });
      }
    }
  }

  if (config.theme?.borderWidth) {
    const bw = ensureGroup(doc, "borderWidth");
    for (const [k, v] of Object.entries(config.theme.borderWidth)) {
      if (typeof v === "string") setToken(bw, k, { $value: v, $type: "dimension" });
      else if (isPlainObject(v)) {
        const sub = ensureGroup(bw, k);
        for (const [sk, sv] of Object.entries(v)) {
          if (typeof sv === "string") setToken(sub, sk, { $value: sv, $type: "dimension" });
        }
      }
    }
  }

  return doc;
}

interface TailwindV4Prefix {
  prefix: string;
  group: string;
  type: DtcgType;
}

const TAILWIND_V4_PREFIXES: TailwindV4Prefix[] = [
  { prefix: "--color-", group: "color", type: "color" },
  { prefix: "--spacing-", group: "spacing", type: "dimension" },
  { prefix: "--font-size-", group: "fontSize", type: "dimension" },
  { prefix: "--font-weight-", group: "fontWeight", type: "fontWeight" },
  { prefix: "--font-family-", group: "fontFamily", type: "fontFamily" },
  { prefix: "--leading-", group: "lineHeight", type: "number" },
  { prefix: "--tracking-", group: "letterSpacing", type: "dimension" },
  { prefix: "--radius-", group: "radius", type: "dimension" },
  { prefix: "--shadow-", group: "shadow", type: "shadow" },
  { prefix: "--transition-duration-", group: "duration", type: "duration" },
  { prefix: "--ease-", group: "easing", type: "cubicBezier" },
  { prefix: "--breakpoint-", group: "breakpoint", type: "dimension" },
  { prefix: "--z-", group: "zIndex", type: "number" },
  { prefix: "--opacity-", group: "opacity", type: "number" },
  { prefix: "--border-width-", group: "borderWidth", type: "dimension" },
];

function classifyTailwindV4Prop(
  prop: string,
): { group: string; type: DtcgType; name: string } | null {
  for (const p of TAILWIND_V4_PREFIXES) {
    if (prop.startsWith(p.prefix)) {
      const name = prop.slice(p.prefix.length);
      if (name.length === 0) return null;
      return { group: p.group, type: p.type, name };
    }
  }
  return null;
}

function normalizeTailwindV4(
  decls: Map<string, string> | Array<[string, string]>,
  warnings: string[],
): DtcgDocument {
  const doc: DtcgDocument = {};
  const entries = decls instanceof Map ? Array.from(decls.entries()) : decls;
  for (const [prop, value] of entries) {
    const cls = classifyTailwindV4Prop(prop);
    if (!cls) {
      warnings.push(`tailwind-v4: "${prop}" does not match a known utility-generating prefix`);
      continue;
    }
    const group = ensureGroup(doc, cls.group);
    setToken(group, cls.name, { $value: value, $type: cls.type });
  }
  return doc;
}

function normalizeCssVars(
  decls: Map<string, string> | Array<[string, string]>,
  warnings: string[],
): DtcgDocument {
  const doc: DtcgDocument = {};
  const entries = decls instanceof Map ? Array.from(decls.entries()) : decls;
  for (const [prop, value] of entries) {
    if (!prop.startsWith("--")) {
      warnings.push(`css-vars: "${prop}" is not a custom property`);
      continue;
    }
    const name = prop.slice(2);
    const parts = name.split("-").filter((s) => s.length > 0);
    if (parts.length === 0) {
      warnings.push(`css-vars: "${prop}" has no usable name`);
      continue;
    }
    const inferred = inferTypeFromValue(value);
    if (!inferred) {
      warnings.push(`css-vars: cannot infer $type for "${prop}" with value "${value}"`);
    }
    const token: DtcgToken<unknown> = inferred
      ? { $value: value, $type: inferred }
      : { $value: value };
    setAt(doc, parts, token);
  }
  return doc;
}

function inferTypeFromValue(value: string): DtcgType | null {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return "color";
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab|color|lab|lch)\s*\(/i.test(v)) return "color";
  if (/^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex|pt|pc|cm|mm|in)$/i.test(v)) return "dimension";
  if (/^-?\d+(\.\d+)?(ms|s)$/i.test(v)) return "duration";
  if (/^cubic-bezier\s*\(/i.test(v)) return "cubicBezier";
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  return null;
}

interface ThemeTsExport {
  colors?: Record<string, unknown>;
  spacing?: Record<string, unknown>;
  fontSize?: Record<string, unknown>;
  fontWeight?: Record<string, unknown>;
  radius?: Record<string, unknown>;
  borderRadius?: Record<string, unknown>;
  shadow?: Record<string, unknown>;
  boxShadow?: Record<string, unknown>;
  zIndex?: Record<string, unknown>;
  opacity?: Record<string, unknown>;
  duration?: Record<string, unknown>;
  easing?: Record<string, unknown>;
  breakpoints?: Record<string, unknown>;
  borderWidth?: Record<string, unknown>;
}

interface ThemeKeyMapping {
  dtcgGroup: string;
  type: DtcgType;
}

const THEME_TS_KEYS: Record<string, ThemeKeyMapping> = {
  colors: { dtcgGroup: "color", type: "color" },
  spacing: { dtcgGroup: "spacing", type: "dimension" },
  fontSize: { dtcgGroup: "fontSize", type: "dimension" },
  fontWeight: { dtcgGroup: "fontWeight", type: "fontWeight" },
  radius: { dtcgGroup: "radius", type: "dimension" },
  borderRadius: { dtcgGroup: "radius", type: "dimension" },
  shadow: { dtcgGroup: "shadow", type: "shadow" },
  boxShadow: { dtcgGroup: "shadow", type: "shadow" },
  zIndex: { dtcgGroup: "zIndex", type: "number" },
  opacity: { dtcgGroup: "opacity", type: "number" },
  duration: { dtcgGroup: "duration", type: "duration" },
  easing: { dtcgGroup: "easing", type: "cubicBezier" },
  breakpoints: { dtcgGroup: "breakpoint", type: "dimension" },
  borderWidth: { dtcgGroup: "borderWidth", type: "dimension" },
};

function emitThemeKey(
  doc: DtcgDocument,
  source: Record<string, unknown>,
  groupName: string,
  type: DtcgType,
  warnings: string[],
): void {
  const group = ensureGroup(doc, groupName);
  const walk = (obj: Record<string, unknown>, path: string[]) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = [...path, k];
      if (typeof v === "string" || typeof v === "number") {
        setAt(group, p, { $value: v, $type: type });
      } else if (isPlainObject(v)) {
        walk(v, p);
      } else {
        warnings.push(`theme-ts: cannot represent value at ${groupName}/${p.join("/")}`);
      }
    }
  };
  walk(source, []);
}

function normalizeThemeTs(theme: ThemeTsExport, warnings: string[]): DtcgDocument {
  const doc: DtcgDocument = {};
  for (const [key, mapping] of Object.entries(THEME_TS_KEYS)) {
    const src = (theme as Record<string, unknown>)[key];
    if (isPlainObject(src)) {
      emitThemeKey(doc, src, mapping.dtcgGroup, mapping.type, warnings);
    }
  }
  for (const key of Object.keys(theme)) {
    if (!(key in THEME_TS_KEYS)) {
      warnings.push(`theme-ts: ignoring unrecognized theme key "${key}"`);
    }
  }
  return doc;
}

function validateDtcgPassthrough(doc: unknown, warnings: string[]): DtcgDocument {
  if (!isPlainObject(doc)) {
    warnings.push("dtcg: root is not an object");
    return {};
  }
  const out: DtcgDocument = doc as DtcgDocument;
  const visit = (node: unknown, path: string[]) => {
    if (!isPlainObject(node)) return;
    if (isDtcgToken(node)) {
      if (node.$type === undefined && !isDtcgAlias(node.$value as unknown)) {
        warnings.push(`dtcg: token at "${path.join(".")}" has no $type`);
      }
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) continue;
      visit(v, [...path, k]);
    }
  };
  visit(out, []);
  return out;
}

export function normalizeToDtcg(input: NormalizerInput): NormalizedTokens {
  const warnings: string[] = [];
  let document: DtcgDocument;
  switch (input.source) {
    case "tailwind-v3":
      document = normalizeTailwindV3((input.data ?? {}) as TailwindV3Config, warnings);
      break;
    case "tailwind-v4":
      document = normalizeTailwindV4(
        input.data as Map<string, string> | Array<[string, string]>,
        warnings,
      );
      break;
    case "css-vars":
      document = normalizeCssVars(
        input.data as Map<string, string> | Array<[string, string]>,
        warnings,
      );
      break;
    case "theme-ts":
      document = normalizeThemeTs((input.data ?? {}) as ThemeTsExport, warnings);
      break;
    case "dtcg":
      document = validateDtcgPassthrough(input.data, warnings);
      break;
  }
  return { document, source: input.source, warnings };
}
