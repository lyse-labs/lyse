import { transform } from "lightningcss";
import type { DtcgDocument } from "../tokens/dtcg-model.js";
import { classifyTailwindV4Prop, normalizeToDtcg } from "../tokens/normalizer.js";

export interface TailwindV4ParseResult {
  document: DtcgDocument;
  utilityGenerating: string[];
  private: string[];
  warnings: string[];
}

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

function extractDeclarations(body: string): { prop: string; value: string }[] {
  const cleaned = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls: { prop: string; value: string }[] = [];
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

export function parseTailwindV4Theme(css: string): TailwindV4ParseResult {
  const warnings: string[] = [];
  try {
    transform({
      filename: "in-memory.css",
      code: Buffer.from(css),
      errorRecovery: true,
    });
  } catch (e) {
    warnings.push(
      `tailwind-v4: Lightning CSS rejected the input (${e instanceof Error ? e.message : "unknown"})`,
    );
    return { document: {}, utilityGenerating: [], private: [], warnings };
  }

  const utilityGenerating: string[] = [];
  const privateProps: string[] = [];
  const utilityEntries: Array<[string, string]> = [];
  const seenUtility = new Set<string>();
  const seenPrivate = new Set<string>();

  for (const block of extractThemeBlocks(css)) {
    for (const { prop, value } of extractDeclarations(block)) {
      const cls = classifyTailwindV4Prop(prop);
      if (cls) {
        if (!seenUtility.has(prop)) {
          utilityGenerating.push(prop);
          seenUtility.add(prop);
        }
        utilityEntries.push([prop, value]);
      } else {
        if (!seenPrivate.has(prop)) {
          privateProps.push(prop);
          seenPrivate.add(prop);
        }
        warnings.push(`tailwind-v4: "${prop}" is in @theme but does not generate a utility class`);
      }
    }
  }

  const { document, warnings: normWarnings } = normalizeToDtcg({
    source: "tailwind-v4",
    data: utilityEntries,
  });
  for (const w of normWarnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  return {
    document,
    utilityGenerating,
    private: privateProps,
    warnings,
  };
}
