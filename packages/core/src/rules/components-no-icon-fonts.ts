import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "components/no-icon-fonts";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Packages that ship an icon WEBFONT (not the SVG-component variants — e.g.
// `@fortawesome/react-fontawesome` and `lucide-react` are SVG and excluded).
const ICON_FONT_PACKAGES = new Set([
  "font-awesome",
  "@fortawesome/fontawesome-free",
  "material-icons",
  "material-symbols",
  "@mdi/font",
  "glyphicons",
  "typicons.font",
  "weathericons",
  "dashicons",
]);

// `font-family` / `@font-face` declaring a known icon-font family.
const RE_ICON_FONT_FAMILY =
  /font-family\s*:\s*["']?\s*(?:font\s*awesome|fontawesome|material\s+icons|material\s+symbols|glyphicons?|icomoon|typicons|dashicons|material\s+design\s+icons)/i;
// Icon-font ligature/glyph class conventions (`material-icons`, `glyphicon`,
// and FontAwesome's `fa`/`fas`/`far`/`fab` + `fa-name`).
const RE_ICON_FONT_CLASS = /\b(?:material-icons|material-symbols[\w-]*|glyphicon|dashicons)\b|\bfa[srlb]?\s+fa-[a-z]/i;

function hasIconFontFamily(src: string): boolean {
  return RE_ICON_FONT_FAMILY.test(src);
}

function hasIconFontClass(src: string): boolean {
  return RE_ICON_FONT_CLASS.test(src);
}

function hasIconFontPackage(deps: Record<string, unknown> | undefined): boolean {
  if (!deps) return false;
  return Object.keys(deps).some((name) => ICON_FONT_PACKAGES.has(name));
}

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function packageJsonDeclaresIconFont(repoRoot: string): boolean {
  const content = readFileIfSmall(join(repoRoot, "package.json"));
  if (content === null) return false;
  let pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; peerDependencies?: Record<string, unknown> };
  try {
    pkg = JSON.parse(content);
  } catch {
    return false;
  }
  return (
    hasIconFontPackage(pkg.dependencies) ||
    hasIconFontPackage(pkg.devDependencies) ||
    hasIconFontPackage(pkg.peerDependencies)
  );
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  const usesIconFont =
    (ctx.repoRoot ? packageJsonDeclaresIconFont(ctx.repoRoot) : false) ||
    files.css.some((f) => !f.skipped && hasIconFontFamily(f.source)) ||
    files.cssInJs.some((b) => hasIconFontFamily(b.content)) ||
    files.ts.some((f) => hasIconFontClass(f.source)) ||
    files.css.some((f) => !f.skipped && hasIconFontClass(f.source));

  if (!usesIconFont) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "components",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Design system ships icons as a font — icon fonts read as garbage to screen readers, ignore forced-colors mode, and block on font load",
    suggestion:
      "deliver icons as inline SVG (or an SVG-component library) with an accessible name / `aria-hidden` for decorative use",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Deliver icons as SVG, not as an icon font",
    fullDescription:
      "Checks, at repo level, whether a design system delivers its icons via an icon webfont rather than SVG. Detects (1) an icon-font dependency in package.json (`font-awesome`, `@fortawesome/fontawesome-free`, `material-icons`, `material-symbols`, `@mdi/font`, `glyphicons`, …); (2) an `@font-face` / `font-family` declaring a known icon-font family; or (3) icon-font ligature classes (`material-icons`, `glyphicon`, `fa fa-*`). Emits one warning at repo level when any signal is found. SVG-component libraries (`lucide-react`, `@fortawesome/react-fontawesome`, etc.) are not flagged.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-no-icon-fonts.md",
    rationale: `Why it matters

Icon fonts map glyphs to private-use Unicode code points. Screen readers announce those code points as meaningless characters, the icons disappear under Windows High Contrast / forced-colors mode, they can't be multi-colored, and they flash-of-unstyled-content until the font loads. SVG icons avoid every one of these: they carry an accessible name (or \`aria-hidden\`), respect forced-colors, and render instantly.

The check is repo-level and broad: any icon-font signal anywhere (dependency, \`@font-face\`, or ligature class) trips it.`,
    examples: [
      {
        good: "import { Home } from \"lucide-react\";\n<Home aria-hidden />",
        bad: "<span className=\"material-icons\">home</span>",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable components/no-icon-fonts` in a README — rule is N/A",
      "SVG-component icon libraries (`lucide-react`, `@fortawesome/react-fontawesome`, …) — not icon fonts, never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  hasIconFontFamily,
  hasIconFontClass,
  hasIconFontPackage,
  packageJsonDeclaresIconFont,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
