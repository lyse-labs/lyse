import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { transform } from "lightningcss";
import type { TokenMap } from "../types.js";

function pushToken(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Yields the body (between `{` and matching `}`) of every `@theme` block in
 * the given CSS source. Brace-aware so nested blocks don't break the match.
 * @theme has a constrained syntax in Tailwind v4 (declarations only, no
 * nested rules), so the body itself never contains unbalanced braces.
 */
function extractThemeBlocks(css: string): string[] {
  const blocks: string[] = [];
  const themeRegex = /@theme\b[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = themeRegex.exec(css)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth === 0) blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

/**
 * Parses simple `--prop: value;` declarations from a CSS block body.
 * Skips comments and ignores anything that isn't a custom property — which
 * is fine for @theme blocks that only contain `--*: value;` entries.
 */
function extractDeclarations(body: string): { prop: string; value: string }[] {
  // Strip /* ... */ comments so they don't appear inside captured values.
  const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls: { prop: string; value: string }[] = [];
  // Custom-property names may include `*` (Tailwind v4 wildcard reset, e.g.
  // `--color-*: initial;`). Allow any non-whitespace/non-colon chars in the name.
  const declRegex = /(--[^\s:{}]+)\s*:\s*([^;]+?)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = declRegex.exec(cleaned)) !== null) {
    const prop = match[1];
    const value = match[2];
    if (prop && value !== undefined) {
      decls.push({ prop, value });
    }
  }
  return decls;
}

async function fromTailwindV3(root: string): Promise<TokenMap | null> {
  const candidates = [
    "tailwind.config.js",
    "tailwind.config.ts",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
  ];
  const found = candidates.find((c) => existsSync(join(root, c)));
  if (!found) return null;
  // NOTE: only module.exports = {...} configs are supported. TypeScript
  // configs and `export default` syntax are not parsed. v0.2 enhancement (#36).
  try {
    const source = readFileSync(join(root, found), "utf8");
    const m = source.match(/module\.exports\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!m || !m[1]) return null;
    // Coerce unquoted keys to quoted keys for JSON.parse
    const jsonish = m[1].replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    const config = JSON.parse(jsonish) as {
      theme?: {
        colors?: Record<string, unknown>;
        spacing?: Record<string, string>;
        fontSize?: Record<string, unknown>;
        fontWeight?: Record<string, string>;
        lineHeight?: Record<string, string>;
        letterSpacing?: Record<string, string>;
        borderRadius?: Record<string, unknown>;
        boxShadow?: Record<string, string>;
        transitionDuration?: Record<string, string>;
        transitionTimingFunction?: Record<string, string>;
        screens?: Record<string, unknown>;
        zIndex?: Record<string, string>;
        opacity?: Record<string, string>;
        borderWidth?: Record<string, unknown>;
      };
    };
    const colors = new Map<string, string[]>();
    const spacing = new Map<string, string[]>();
    const typography = new Map<string, string[]>();
    const radii = new Map<string, string[]>();
    const shadows = new Map<string, string[]>();
    const motion = new Map<string, string[]>();
    const breakpoints = new Map<string, string[]>();
    const zIndex = new Map<string, string[]>();
    const opacity = new Map<string, string[]>();
    const borderWidth = new Map<string, string[]>();

    for (const [k, v] of Object.entries(config.theme?.colors ?? {})) {
      if (typeof v === "string") pushToken(colors, v.toLowerCase(), k);
    }
    for (const [k, v] of Object.entries(config.theme?.spacing ?? {})) {
      const num = String(v).replace(/px$/, "");
      pushToken(spacing, num, k);
    }

    // fontSize: value can be "16px", ["16px", { lineHeight: "24px" }], or { size: "16px" }
    for (const [k, v] of Object.entries(config.theme?.fontSize ?? {})) {
      let sizeStr: string | null = null;
      if (typeof v === "string") {
        sizeStr = v;
      } else if (Array.isArray(v) && typeof v[0] === "string") {
        sizeStr = v[0] as string;
      } else if (typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).size === "string") {
        sizeStr = (v as Record<string, unknown>).size as string;
      }
      if (sizeStr) pushToken(typography, sizeStr.toLowerCase().trim(), `typography/${k}`);
    }

    // fontWeight
    for (const [k, v] of Object.entries(config.theme?.fontWeight ?? {})) {
      if (typeof v === "string") pushToken(typography, `weight/${v.trim()}`, `typography/${k}`);
    }

    // lineHeight
    for (const [k, v] of Object.entries(config.theme?.lineHeight ?? {})) {
      if (typeof v === "string") pushToken(typography, `line-height/${v.trim()}`, `typography/${k}`);
    }

    // letterSpacing
    for (const [k, v] of Object.entries(config.theme?.letterSpacing ?? {})) {
      if (typeof v === "string") pushToken(typography, `letter-spacing/${v.trim()}`, `typography/${k}`);
    }

    // borderRadius: value can be string or object with sub-keys (descend one level)
    for (const [k, v] of Object.entries(config.theme?.borderRadius ?? {})) {
      if (typeof v === "string") {
        pushToken(radii, v.toLowerCase().trim(), `radii/${k}`);
      } else if (typeof v === "object" && v !== null) {
        for (const [subK, subV] of Object.entries(v as Record<string, unknown>)) {
          if (typeof subV === "string") pushToken(radii, subV.toLowerCase().trim(), `radii/${k}/${subK}`);
        }
      }
    }

    // boxShadow
    for (const [k, v] of Object.entries(config.theme?.boxShadow ?? {})) {
      if (typeof v === "string") pushToken(shadows, v.trim(), `shadows/${k}`);
    }

    // transitionDuration — key prefix "duration/"
    for (const [k, v] of Object.entries(config.theme?.transitionDuration ?? {})) {
      if (typeof v === "string") pushToken(motion, `duration/${v.toLowerCase().trim()}`, `motion/duration/${k}`);
    }

    // transitionTimingFunction — key prefix "easing/"
    for (const [k, v] of Object.entries(config.theme?.transitionTimingFunction ?? {})) {
      if (typeof v === "string") pushToken(motion, `easing/${v.toLowerCase().trim()}`, `motion/easing/${k}`);
    }

    // screens: value can be "768px" or { min: "768px" } or { max: "1023px" }
    for (const [k, v] of Object.entries(config.theme?.screens ?? {})) {
      let bpStr: string | null = null;
      if (typeof v === "string") {
        bpStr = v;
      } else if (typeof v === "object" && v !== null) {
        const obj = v as Record<string, unknown>;
        if (typeof obj.min === "string") bpStr = obj.min;
        else if (typeof obj.max === "string") bpStr = obj.max;
      }
      if (bpStr) pushToken(breakpoints, bpStr.toLowerCase().trim(), `breakpoints/${k}`);
    }

    // zIndex
    for (const [k, v] of Object.entries(config.theme?.zIndex ?? {})) {
      if (typeof v === "string") pushToken(zIndex, v.trim(), `zIndex/${k}`);
    }

    // opacity
    for (const [k, v] of Object.entries(config.theme?.opacity ?? {})) {
      if (typeof v === "string") pushToken(opacity, v.trim(), `opacity/${k}`);
    }

    // borderWidth: value can be string or object with sub-keys
    for (const [k, v] of Object.entries(config.theme?.borderWidth ?? {})) {
      if (typeof v === "string") {
        pushToken(borderWidth, v.toLowerCase().trim(), `borderWidth/${k}`);
      } else if (typeof v === "object" && v !== null) {
        for (const [subK, subV] of Object.entries(v as Record<string, unknown>)) {
          if (typeof subV === "string") pushToken(borderWidth, subV.toLowerCase().trim(), `borderWidth/${k}/${subK}`);
        }
      }
    }

    return { colors, spacing, typography, radii, shadows, motion, breakpoints, zIndex, opacity, borderWidth, source: "tailwind-v3" };
  } catch {
    return null;
  }
}

async function fromTailwindV4(root: string): Promise<TokenMap | null> {
  const cssFiles = await fg(["**/*.css"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
  const colors = new Map<string, string[]>();
  const spacing = new Map<string, string[]>();
  const typography = new Map<string, string[]>();
  const radii = new Map<string, string[]>();
  const shadows = new Map<string, string[]>();
  const motion = new Map<string, string[]>();
  const breakpoints = new Map<string, string[]>();
  const zIndex = new Map<string, string[]>();
  const opacity = new Map<string, string[]>();
  const borderWidth = new Map<string, string[]>();

  const perFileResults = await Promise.all(
    cssFiles.map(async (file) => {
      const css = readFileSync(file, "utf8");
      if (!css.includes("@theme") || !css.includes("tailwindcss")) return null;
      const localColors = new Map<string, string[]>();
      const localSpacing = new Map<string, string[]>();
      const localTypography = new Map<string, string[]>();
      const localRadii = new Map<string, string[]>();
      const localShadows = new Map<string, string[]>();
      const localMotion = new Map<string, string[]>();
      const localBreakpoints = new Map<string, string[]>();
      const localZIndex = new Map<string, string[]>();
      const localOpacity = new Map<string, string[]>();
      const localBorderWidth = new Map<string, string[]>();
      // Validate the CSS parses via Lightning CSS (replaces postcss.parse).
      // Errors are tolerated (errorRecovery) so a malformed file with a valid
      // @theme block is still extractable.
      try {
        transform({
          filename: file,
          code: Buffer.from(css),
          errorRecovery: true,
        });
      } catch {
        // Unparseable file — skip entirely (mirrors prior postcss.parse failure mode).
        return null;
      }
      // Walk @theme blocks via brace-matching on the raw source. Lightning CSS
      // exposes Tailwind v4 `@theme` as an UnknownAtRule whose body comes back
      // as a flat TokenOrValue list (no per-declaration loc), so serializing
      // values back to source-identical text is lossy. Brace-matching keeps
      // exact formatting (e.g. `rgba(0,0,0,0.1)` vs `rgba(0, 0, 0, 0.1)`).
      // @theme has a constrained syntax (no nested rules in Tailwind v4 usage).
      for (const block of extractThemeBlocks(css)) {
        for (const { prop, value } of extractDeclarations(block)) {
          const val = value.trim();
          const valLower = val.toLowerCase();
          if (prop.startsWith("--color-")) {
            pushToken(localColors, valLower, prop.replace("--color-", ""));
          } else if (prop.startsWith("--spacing-")) {
            pushToken(localSpacing, val.replace(/px$/, ""), prop.replace("--spacing-", ""));
          } else if (prop.startsWith("--font-size-")) {
            pushToken(localTypography, valLower, prop.replace("--font-size-", ""));
          } else if (prop.startsWith("--font-weight-")) {
            pushToken(localTypography, `weight/${val}`, prop.replace("--font-weight-", ""));
          } else if (prop.startsWith("--leading-")) {
            pushToken(localTypography, `line-height/${val}`, prop.replace("--leading-", ""));
          } else if (prop.startsWith("--tracking-")) {
            pushToken(localTypography, `letter-spacing/${val}`, prop.replace("--tracking-", ""));
          } else if (prop.startsWith("--radius-")) {
            pushToken(localRadii, valLower, prop.replace("--radius-", ""));
          } else if (prop.startsWith("--shadow-") && !prop.startsWith("--shadow-color-")) {
            // Exclude --shadow-color-* which belongs to colors
            pushToken(localShadows, val, prop.replace("--shadow-", ""));
          } else if (prop.startsWith("--transition-duration-")) {
            // Tailwind v4 uses --transition-duration-* (verified from TW v4 source)
            pushToken(localMotion, `duration/${valLower}`, prop.replace("--transition-duration-", ""));
          } else if (prop.startsWith("--ease-")) {
            // Tailwind v4 uses --ease-* for timing functions
            pushToken(localMotion, `easing/${valLower}`, prop.replace("--ease-", ""));
          } else if (prop.startsWith("--breakpoint-")) {
            pushToken(localBreakpoints, valLower, prop.replace("--breakpoint-", ""));
          } else if (prop.startsWith("--z-")) {
            pushToken(localZIndex, val, prop.replace("--z-", ""));
          } else if (prop.startsWith("--opacity-")) {
            pushToken(localOpacity, val, prop.replace("--opacity-", ""));
          } else if (prop.startsWith("--border-width-")) {
            pushToken(localBorderWidth, valLower, prop.replace("--border-width-", ""));
          }
        }
      }
      return {
        localColors, localSpacing, localTypography, localRadii, localShadows,
        localMotion, localBreakpoints, localZIndex, localOpacity, localBorderWidth,
      };
    }),
  );
  let found = false;
  for (const r of perFileResults) {
    if (!r) continue;
    found = true;
    for (const [k, vs] of r.localColors) for (const v of vs) pushToken(colors, k, v);
    for (const [k, vs] of r.localSpacing) for (const v of vs) pushToken(spacing, k, v);
    for (const [k, vs] of r.localTypography) for (const v of vs) pushToken(typography, k, v);
    for (const [k, vs] of r.localRadii) for (const v of vs) pushToken(radii, k, v);
    for (const [k, vs] of r.localShadows) for (const v of vs) pushToken(shadows, k, v);
    for (const [k, vs] of r.localMotion) for (const v of vs) pushToken(motion, k, v);
    for (const [k, vs] of r.localBreakpoints) for (const v of vs) pushToken(breakpoints, k, v);
    for (const [k, vs] of r.localZIndex) for (const v of vs) pushToken(zIndex, k, v);
    for (const [k, vs] of r.localOpacity) for (const v of vs) pushToken(opacity, k, v);
    for (const [k, vs] of r.localBorderWidth) for (const v of vs) pushToken(borderWidth, k, v);
  }
  if (!found) return null;
  return { colors, spacing, typography, radii, shadows, motion, breakpoints, zIndex, opacity, borderWidth, source: "tailwind-v4" };
}

interface DtcgNode {
  $value?: string;
  $type?: string;
  [k: string]: unknown;
}

/**
 * Serialize a DTCG shadow object to a CSS box-shadow string.
 * DTCG shadow $value: { color, offsetX, offsetY, blur, spread }
 */
function serializeDtcgShadow(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null) {
    const s = v as Record<string, unknown>;
    const parts = [s.offsetX, s.offsetY, s.blur, s.spread, s.color]
      .filter((p) => p !== undefined && p !== null)
      .map(String);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  return null;
}

async function fromDtcg(root: string): Promise<TokenMap | null> {
  const files = await fg(["**/*.tokens.json"], {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
  if (files.length === 0) return null;
  const colors = new Map<string, string[]>();
  const spacing = new Map<string, string[]>();
  const typography = new Map<string, string[]>();
  const radii = new Map<string, string[]>();
  const shadows = new Map<string, string[]>();
  const motion = new Map<string, string[]>();
  const zIndex = new Map<string, string[]>();
  const opacity = new Map<string, string[]>();
  const borderWidth = new Map<string, string[]>();
  const breakpoints = new Map<string, string[]>();

  const localEntries = await Promise.all(
    files.map(async (f) => {
      const localColors = new Map<string, string[]>();
      const localSpacing = new Map<string, string[]>();
      const localTypography = new Map<string, string[]>();
      const localRadii = new Map<string, string[]>();
      const localShadows = new Map<string, string[]>();
      const localMotion = new Map<string, string[]>();
      const localZIndex = new Map<string, string[]>();
      const localOpacity = new Map<string, string[]>();
      const localBorderWidth = new Map<string, string[]>();
      const localBreakpoints = new Map<string, string[]>();

      const visit = (node: DtcgNode, path: string[]) => {
        if (node.$value !== undefined && node.$type) {
          const tokenPath = path.join("/");
          const rawValue = node.$value;
          const value = String(rawValue).toLowerCase().trim();

          switch (node.$type) {
            case "color":
              pushToken(localColors, value, tokenPath);
              break;
            case "dimension":
              // Route dimension to the right map based on path heuristics
              if (/radius/i.test(tokenPath)) {
                pushToken(localRadii, value.replace(/px$/, "") + (value.endsWith("px") ? "px" : ""), tokenPath);
              } else if (/border.?width/i.test(tokenPath)) {
                pushToken(localBorderWidth, value, tokenPath);
              } else if (/breakpoint|screen/i.test(tokenPath)) {
                pushToken(localBreakpoints, value, tokenPath);
              } else {
                // Default dimension → spacing (existing behavior)
                pushToken(localSpacing, value.replace(/px$/, ""), tokenPath);
              }
              break;
            case "shadow": {
              const shadowStr = serializeDtcgShadow(rawValue);
              if (shadowStr) pushToken(localShadows, shadowStr, tokenPath);
              break;
            }
            case "duration":
              pushToken(localMotion, `duration/${value}`, tokenPath);
              break;
            case "cubicBezier": {
              // cubicBezier $value is an array [x1, y1, x2, y2]
              const bezier = Array.isArray(rawValue)
                ? `cubic-bezier(${(rawValue as unknown[]).join(", ")})`
                : String(rawValue);
              pushToken(localMotion, `easing/${bezier.toLowerCase()}`, tokenPath);
              break;
            }
            case "fontFamily":
              pushToken(localTypography, `family/${value}`, tokenPath);
              break;
            case "fontWeight":
              pushToken(localTypography, `weight/${value}`, tokenPath);
              break;
            case "typography": {
              // DTCG composite: extract fontSize string from composite object
              if (typeof rawValue === "object" && rawValue !== null) {
                const composite = rawValue as Record<string, unknown>;
                if (typeof composite.fontSize === "string") {
                  pushToken(localTypography, composite.fontSize.toLowerCase().trim(), tokenPath);
                }
                // NOTE: other sub-fields (lineHeight, letterSpacing, etc.) are not extracted
                // here to avoid ambiguity. They should be separate $type tokens.
              }
              break;
            }
            case "number": {
              // DTCG $type "number" is used for z-index and opacity in some token files
              // Route based on path heuristics
              if (/z.?index/i.test(tokenPath)) {
                pushToken(localZIndex, value, tokenPath);
              } else if (/opacity/i.test(tokenPath)) {
                pushToken(localOpacity, value, tokenPath);
              }
              // Other numeric types are skipped; add cases as needed in v0.2
              break;
            }
            // NOTE: $type values not listed here (e.g., "gradient", "lineHeight") are skipped.
            // Add handling as needed in v0.2.
          }
          return;
        }
        for (const [k, v] of Object.entries(node)) {
          if (k.startsWith("$")) continue;
          if (v && typeof v === "object") visit(v as DtcgNode, [...path, k]);
        }
      };
      visit(JSON.parse(readFileSync(f, "utf8")) as DtcgNode, []);
      return {
        localColors, localSpacing, localTypography, localRadii, localShadows,
        localMotion, localZIndex, localOpacity, localBorderWidth, localBreakpoints,
      };
    }),
  );
  for (const entry of localEntries) {
    for (const [k, vs] of entry.localColors) for (const v of vs) pushToken(colors, k, v);
    for (const [k, vs] of entry.localSpacing) for (const v of vs) pushToken(spacing, k, v);
    for (const [k, vs] of entry.localTypography) for (const v of vs) pushToken(typography, k, v);
    for (const [k, vs] of entry.localRadii) for (const v of vs) pushToken(radii, k, v);
    for (const [k, vs] of entry.localShadows) for (const v of vs) pushToken(shadows, k, v);
    for (const [k, vs] of entry.localMotion) for (const v of vs) pushToken(motion, k, v);
    for (const [k, vs] of entry.localZIndex) for (const v of vs) pushToken(zIndex, k, v);
    for (const [k, vs] of entry.localOpacity) for (const v of vs) pushToken(opacity, k, v);
    for (const [k, vs] of entry.localBorderWidth) for (const v of vs) pushToken(borderWidth, k, v);
    for (const [k, vs] of entry.localBreakpoints) for (const v of vs) pushToken(breakpoints, k, v);
  }
  return {
    colors, spacing, typography, radii, shadows, motion, breakpoints, zIndex, opacity, borderWidth,
    source: "dtcg",
  };
}

export async function loadTokens(root: string): Promise<TokenMap | null> {
  return (
    (await fromTailwindV3(root)) ??
    (await fromTailwindV4(root)) ??
    (await fromDtcg(root))
  );
}
