import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "components/svg-viewbox";

// Match an <svg ...> opening tag (word-boundary after `svg` so <svgWrapper>
// doesn't match). `[^>]*` spans newlines, so multiline tags are captured.
const SVG_OPEN_RE = /<svg\b[^>]*>/gi;

/** An inline `<svg>` opening tag with its viewBox presence. */
export interface SvgElement {
  line: number;
  column: number;
  hasViewBox: boolean;
}

/**
 * Finds inline `<svg>` opening tags. A tag carrying a JSX spread (`{...props}`)
 * is skipped entirely — `viewBox` may arrive at runtime, so flagging it would
 * be a false positive.
 */
export function scanSvgElements(source: string): SvgElement[] {
  const els: SvgElement[] = [];
  for (const m of source.matchAll(SVG_OPEN_RE)) {
    const tag = m[0];
    if (tag.includes("{...")) continue;
    const idx = m.index ?? 0;
    const before = source.slice(0, idx);
    const line = before.split("\n").length;
    const column = idx - before.lastIndexOf("\n");
    els.push({ line, column, hasViewBox: /\bviewBox\b/.test(tag) });
  }
  return els;
}

const evaluate = async (_ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const file of files.ts) {
    for (const el of scanSvgElements(file.source)) {
      opportunities += 1;
      if (el.hasViewBox) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "components",
        severity: "warning",
        location: { file: file.path, line: el.line, column: el.column },
        message:
          "Inline `<svg>` has no `viewBox` — a fixed-size icon without a viewBox does not scale and can crop",
        suggestion:
          'add a `viewBox` (e.g. `viewBox="0 0 24 24"`) so the icon scales cleanly at any size; keep width/height for the default render size',
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Inline `<svg>` icons should declare a `viewBox`",
    fullDescription:
      "Scans TypeScript/JavaScript JSX for inline `<svg>` opening tags and flags any without a `viewBox` attribute. A `<svg>` with fixed width/height but no `viewBox` does not scale cleanly and can crop its contents — an icon-quality defect. Counts every inline `<svg>` as one opportunity (tags carrying a `{...spread}` are skipped, since a viewBox may arrive at runtime); emits a warning per viewBox-less tag and nothing when all carry one. Self-gating: a design system with no inline SVG records zero opportunities and is N/A.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-svg-viewbox.md",
    rationale: `Why it matters

An inline \`<svg>\` without a \`viewBox\` is locked to its intrinsic pixel size: scaling it (a larger icon, a high-DPI display, a zoom) crops or distorts the artwork instead of resizing the coordinate system. A \`viewBox\` makes the icon resolution-independent — the single most important attribute for a scalable icon.

The check is purely structural — it asks only whether the attribute is present, never inspecting its value — so synthetic precision equals real precision. Tags with a JSX spread are deliberately not counted, because the attribute could be supplied dynamically.`,
    examples: [
      {
        good: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="…" /></svg>',
        bad: '<svg width="24" height="24"><path d="…" /></svg>',
      },
    ],
    allowlist: [
      "inline `// lyse-disable-next-line components/svg-viewbox` above the element",
      "`<svg {...props}>` — skipped (viewBox may be supplied at runtime), not counted as an opportunity",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});

export const _internal = { scanSvgElements };
