import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { transform } from "lightningcss";
import type { TokenMap } from "../types.js";
import { dimensionAxisForPath, numberAxisForPath } from "../tokens/axis-heuristics.js";

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

export async function fromTailwindV3(root: string): Promise<TokenMap | null> {
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

export async function fromTailwindV4(root: string): Promise<TokenMap | null> {
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
      let css: string;
      try {
        css = readFileSync(file, "utf8");
      } catch {
        // File vanished between glob and read, or unreadable — skip it.
        process.stderr.write(`[lyse] skipped unreadable CSS file while loading tokens: ${file}\n`);
        return null;
      }
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

export async function fromDtcg(root: string): Promise<TokenMap | null> {
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
              // Route dimension to the right map. The path heuristics are
              // shared verbatim with graph/extract/tokens.ts#axisFor — see
              // tokens/axis-heuristics.ts. Only the per-axis VALUE handling
              // below is loader-specific.
              switch (dimensionAxisForPath(tokenPath)) {
                case "radii":
                  pushToken(localRadii, value.replace(/px$/, "") + (value.endsWith("px") ? "px" : ""), tokenPath);
                  break;
                case "borderWidth":
                  pushToken(localBorderWidth, value, tokenPath);
                  break;
                case "breakpoints":
                  pushToken(localBreakpoints, value, tokenPath);
                  break;
                case "spacing":
                  // Default dimension → spacing (existing behavior)
                  pushToken(localSpacing, value.replace(/px$/, ""), tokenPath);
                  break;
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
              // DTCG $type "number" is used for z-index and opacity in some
              // token files. Route on the shared path heuristics
              // (tokens/axis-heuristics.ts). `allowZPrefix: false` preserves
              // this loader's exact pre-existing behaviour: a bare `z/…` path
              // is a CSS-custom-property artefact (`--z-modal` split on `-`),
              // which only the graph produces, so this path has never matched
              // it. Anything else is skipped rather than guessed at.
              switch (numberAxisForPath(tokenPath, { allowZPrefix: false })) {
                case "zIndex":
                  pushToken(localZIndex, value, tokenPath);
                  break;
                case "opacity":
                  pushToken(localOpacity, value, tokenPath);
                  break;
                case undefined:
                  break;
              }
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
      let parsed: DtcgNode;
      try {
        parsed = JSON.parse(readFileSync(f, "utf8")) as DtcgNode;
      } catch {
        // Malformed JSON or unreadable file — skip it, don't crash the audit.
        // Warn so a broken token file isn't masked (a missing token map entry
        // would otherwise surface as a false-positive "hardcoded" finding).
        process.stderr.write(`[lyse] skipped invalid/unreadable token file: ${f}\n`);
        return null;
      }
      visit(parsed, []);
      return {
        localColors, localSpacing, localTypography, localRadii, localShadows,
        localMotion, localZIndex, localOpacity, localBorderWidth, localBreakpoints,
      };
    }),
  );
  for (const entry of localEntries) {
    if (!entry) continue;
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

// Serialize a Tokens-Studio / Style-Dictionary shadow value (object with
// x/y or offsetX/offsetY, or an array of them) to a CSS box-shadow string.
function serializeValueTypeShadow(v: unknown): string | null {
  const one = (o: Record<string, unknown>): string =>
    [o.x ?? o.offsetX, o.y ?? o.offsetY, o.blur, o.spread, o.color]
      .filter((p) => p !== undefined && p !== null && p !== "")
      .map(String)
      .join(" ");
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    const parts = v.filter((o) => o && typeof o === "object").map((o) => one(o as Record<string, unknown>)).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof v === "object" && v !== null) {
    const s = one(v as Record<string, unknown>);
    return s || null;
  }
  return null;
}

interface ValueTypeMaps {
  colors: Map<string, string[]>; spacing: Map<string, string[]>; typography: Map<string, string[]>;
  radii: Map<string, string[]>; shadows: Map<string, string[]>; motion: Map<string, string[]>;
  zIndex: Map<string, string[]>; opacity: Map<string, string[]>; borderWidth: Map<string, string[]>;
  breakpoints: Map<string, string[]>;
}

// Route a Style-Dictionary / Tokens-Studio `{ value, type }` leaf into the
// token map by its EXPLICIT type name (more precise than DTCG's path heuristic).
function routeValueTypeToken(maps: ValueTypeMaps, type: string, rawValue: unknown, path: string): void {
  // References (`{color.brand}` / `$color.brand`) are aliases, not literal tokens.
  if (typeof rawValue === "string" && /^\{.*\}$/.test(rawValue.trim())) return;
  const t = type.toLowerCase();
  const value = String(rawValue).toLowerCase().trim();
  if (t === "color") pushToken(maps.colors, value, path);
  else if (["spacing", "sizing", "dimension", "size"].includes(t)) pushToken(maps.spacing, value.replace(/px$/, ""), path);
  else if (["borderradius", "radius"].includes(t)) pushToken(maps.radii, value, path);
  else if (t === "borderwidth") pushToken(maps.borderWidth, value, path);
  else if (["fontsizes", "fontsize"].includes(t)) pushToken(maps.typography, value, path);
  else if (["fontfamilies", "fontfamily"].includes(t)) pushToken(maps.typography, `family/${value}`, path);
  else if (["fontweights", "fontweight"].includes(t)) pushToken(maps.typography, `weight/${value}`, path);
  else if (["lineheights", "lineheight"].includes(t)) pushToken(maps.typography, `line-height/${value}`, path);
  else if (t === "letterspacing") pushToken(maps.typography, `letter-spacing/${value}`, path);
  else if (["boxshadow", "shadow"].includes(t)) { const s = serializeValueTypeShadow(rawValue); if (s) pushToken(maps.shadows, s.toLowerCase(), path); }
  else if (t === "opacity") pushToken(maps.opacity, value, path);
  else if (["zindex", "z-index"].includes(t)) pushToken(maps.zIndex, value, path);
  else if (["duration", "transition"].includes(t)) pushToken(maps.motion, `duration/${value}`, path);
  else if (["cubicbezier", "easing"].includes(t)) pushToken(maps.motion, `easing/${value}`, path);
}

interface JsonObj { [k: string]: unknown }

/**
 * Style Dictionary (v3 `value`/`type`), Tokens Studio (`$metadata`/`$themes`
 * wrappers + TS type names), and Figma Variables (via their DTCG/Tokens-Studio
 * export) — all share a `{ value, type }` leaf shape. Normalized into the same
 * token-map model. DTCG (`$value`/`$type`) files are inert here (handled by
 * `fromDtcg`) since they carry no bare `value`/`type` leaf.
 */
export async function fromValueTypeTokens(root: string): Promise<TokenMap | null> {
  const files = await fg(["**/tokens.json", "**/tokens/**/*.json", "**/*.tokens.json"], {
    cwd: root, absolute: true, ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"], onlyFiles: true, unique: true,
  });
  if (files.length === 0) return null;

  const maps: ValueTypeMaps = {
    colors: new Map(), spacing: new Map(), typography: new Map(), radii: new Map(), shadows: new Map(),
    motion: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map(), breakpoints: new Map(),
  };
  let sawTokensStudio = false;

  const walk = (node: JsonObj, path: string[]): void => {
    const type = node["type"];
    if (node["value"] !== undefined && typeof type === "string") {
      routeValueTypeToken(maps, type, node["value"], path.join("/"));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) continue; // strips Tokens-Studio $metadata / $themes
      if (v && typeof v === "object") walk(v as JsonObj, [...path, k]);
    }
  };

  for (const f of files) {
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as JsonObj;
    if ("$metadata" in obj || "$themes" in obj) sawTokensStudio = true;
    walk(obj, []);
  }

  const total = maps.colors.size + maps.spacing.size + maps.typography.size + maps.radii.size +
    maps.shadows.size + maps.motion.size + maps.zIndex.size + maps.opacity.size + maps.borderWidth.size + maps.breakpoints.size;
  if (total === 0) return null;
  return { ...maps, source: sawTokensStudio ? "tokens-studio" : "style-dictionary" };
}

function hasAnyToken(tm: TokenMap | null): TokenMap | null {
  if (!tm) return null;
  const n = tm.colors.size + tm.spacing.size + tm.typography.size + tm.radii.size + tm.shadows.size +
    tm.motion.size + tm.zIndex.size + tm.opacity.size + tm.borderWidth.size + tm.breakpoints.size;
  return n > 0 ? tm : null;
}

export async function loadTokens(root: string): Promise<TokenMap | null> {
  return (
    hasAnyToken(await fromTailwindV3(root)) ??
    hasAnyToken(await fromTailwindV4(root)) ??
    hasAnyToken(await fromDtcg(root)) ??
    hasAnyToken(await fromValueTypeTokens(root))
  );
}
