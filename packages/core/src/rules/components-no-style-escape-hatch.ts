import { createRequire } from "node:module";
import type { RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { isVendoredOrResetFile, isLowSignalValueFile, isSchemaOrDataFile } from "./_skip-context.js";
import { createLyseRule } from "./_rule-module.js";
import { isDsComponent } from "./_ds-component.js";
import { isScored } from "../graph/query.js";

const require = createRequire(import.meta.url);

// Lazy-loaded ts-morph module reference (avoids startup latency).
let tsMorphMod: { Project: new (opts: unknown) => import("ts-morph").Project; SyntaxKind: typeof import("typescript").SyntaxKind } | null = null;

function getTsMorphMod(): { Project: new (opts: unknown) => import("ts-morph").Project; SyntaxKind: typeof import("typescript").SyntaxKind } {
  if (!tsMorphMod) {
    tsMorphMod = require("ts-morph") as typeof tsMorphMod;
  }
  return tsMorphMod!;
}

function lineFromIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  // DS-self exemption: when auditing the design system itself, inline style on your own components is implementation, not a bypass.
  if (ctx.dsSelfMode === true) return { findings, opportunities };

  // No DS configured — nothing to identify as a DS component.
  if (ctx.componentsModule === null && ctx.componentInventory.length === 0) {
    return { findings, opportunities };
  }

  const mod = getTsMorphMod();
  const { Project, SyntaxKind } = mod;

  const JsxAttributeKind = SyntaxKind.JsxAttribute;
  const JsxSelfClosingElementKind = SyntaxKind.JsxSelfClosingElement;
  const JsxOpeningElementKind = SyntaxKind.JsxOpeningElement;

  const dsCtx = {
    componentsModule: ctx.componentsModule,
    componentInventory: ctx.componentInventory,
  };

  for (const f of files.ts) {
    if (!f.path.match(/\.(tsx|jsx)$/)) continue;
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (isVendoredOrResetFile(f.path)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    if (isSchemaOrDataFile(f.path)) continue;

    // Create a fresh in-memory ts-morph project per file.
    // A throwaway project (no disk reads) is fast enough for this rule —
    // we only need import-declaration AST, not type resolution.
    let sourceFile: import("ts-morph").SourceFile;
    try {
      const project = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        compilerOptions: { allowJs: true, noEmit: true, jsx: 2 /* JsxEmit.React */ },
      });
      // Use the actual file path so ts-morph treats *.tsx as TSX.
      sourceFile = project.createSourceFile(f.path, f.source, { overwrite: true });
    } catch {
      continue;
    }

    const jsxElements = [
      ...sourceFile.getDescendantsOfKind(JsxOpeningElementKind),
      ...sourceFile.getDescendantsOfKind(JsxSelfClosingElementKind),
    ];

    for (const el of jsxElements) {
      const tagName = el.getTagNameNode().getText();

      if (!isDsComponent(tagName, sourceFile, dsCtx)) continue;

      if (ctx.graph && !isScored(ctx.graph, f.path)) continue;

      opportunities++;

      const hasStyle = el.getAttributes().some((attr) => {
        // Only JsxAttribute (not JsxSpreadAttribute) has getNameNode().
        if (attr.getKind() !== JsxAttributeKind) return false;
        // Cast is safe: we just checked the kind.
        const jsxAttr = attr as import("ts-morph").JsxAttribute;
        return jsxAttr.getNameNode().getText() === "style";
      });

      if (!hasStyle) continue;

      const pos = el.getStart();
      const line = lineFromIndex(f.source, pos);
      const lineText = f.source.split("\n")[line - 1]?.trim().slice(0, 120);

      findings.push({
        ruleId: "components/no-style-escape-hatch",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line, column: 1 },
        message: `Inline \`style\` on DS component \`<${tagName}>\` bypasses its prop API — use the component's styling props/tokens.`,
        ...(lineText !== undefined && { context: lineText }),
      });
    }
  }

  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "components/no-style-escape-hatch",
    defaultSeverity: "warning",
    shortDescription: "Disallow inline `style` prop on DS components",
    fullDescription:
      "An inline `style` prop on a design-system component bypasses the component's own prop API (variant/size/color props, CSS-variable theming). It makes one-off overrides invisible to token tooling, breaks dark-mode propagation, and forks the component's visual contract silently.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-no-style-escape-hatch.md",
    rationale: `Why it matters

DS components expose a deliberate prop API precisely so that consumers never need to reach for \`style\`. An inline \`style\` prop is the runtime equivalent of !important: it bypasses variant tokens, breaks dark-mode cascade, and survives token renames silently.

The rule is value-agnostic: \`style={{ color: "red" }}\` and \`style={{ margin: 0 }}\` are equally flagged. The fix is always to use the component's intended API (\`variant\`, \`size\`, \`color\`, \`sx\`, etc.) or a global token instead.`,
    examples: [
      { good: '<Button variant="primary" size="md">Save</Button>', bad: '<Button style={{ color: "#2563eb" }}>Save</Button>' },
      { good: '<Badge color="success" />', bad: '<Badge style={{ background: "green" }} />' },
    ],
    allowlist: [],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});
