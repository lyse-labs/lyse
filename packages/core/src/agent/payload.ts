import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult, Finding, TokenMap } from "../types.js";
import { getRegisteredRuleMeta } from "../rules/_rule-module.js";
import { renderJson } from "../reporters/json.js";

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export interface PayloadOptions {
  projectName: string;
  topN: number;
  maxFilesPerRule: number;
}

export function buildHandoffPayload(findings: Finding[], opts: PayloadOptions): string {
  const byGroup = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = f.fixGroup?.key ?? f.ruleId;
    const list = byGroup.get(k) ?? [];
    list.push(f);
    byGroup.set(k, list);
  }
  const groups = [...byGroup.entries()].sort((a, b) => {
    const sa = SEVERITY_ORDER[a[1][0]!.severity];
    const sb = SEVERITY_ORDER[b[1][0]!.severity];
    if (sa !== sb) return sa - sb;
    return b[1].length - a[1].length;
  });

  const lines: string[] = [
    `Fix the top ${Math.min(opts.topN, groups.length)} design-system issues Lyse found in ${opts.projectName} on this pass — leave the rest for a follow-up.`,
    "",
  ];
  groups.slice(0, opts.topN).forEach(([, group], i) => {
    const first = group[0]!;
    const ruleId = first.ruleId;
    const fg = first.fixGroup;
    const help = getRegisteredRuleMeta(ruleId)?.helpUri;
    const sites = `${group.length} site${group.length === 1 ? "" : "s"}`;
    const badge = fg ? `one fix · ${sites}` : sites;
    const title = fg ? `${ruleId} · ${fg.from}${fg.to ? ` → ${fg.to}` : ""}` : ruleId;
    lines.push(`${i + 1}. ${first.severity.toUpperCase()} ${first.axis}: ${title} (${badge})`);
    lines.push(`   ${first.message}`);
    if (fg && !fg.to) lines.push(`   no single token matched ${fg.from} — pick one from tokens.json and apply it to every site`);
    else if (first.suggestion) lines.push(`   fix: ${first.suggestion}`);
    if (help) lines.push(`   recipe: ${help}  (or run \`lyse explain ${ruleId}\`)`);
    group.slice(0, opts.maxFilesPerRule).forEach((f) => lines.push(`   - ${f.location.file}:${f.location.line}`));
    const extra = group.length - opts.maxFilesPerRule;
    if (extra > 0) lines.push(`   - +${extra} more file${extra === 1 ? "" : "s"}`);
    lines.push("");
  });
  lines.push(
    "All findings + the project's token map are in the handoff dir (findings.json, tokens.json).",
    "Fix the root cause — don't suppress the rule. Map hardcoded values to the project's tokens (see tokens.json).",
    "Edit the working tree only — don't commit, don't open PRs.",
    "When done, run `lyse audit` and confirm the Health Score went up. Teach me as you go.",
  );
  return lines.join("\n") + "\n";
}

export function serializeTokenMap(tokens: TokenMap | null): Record<string, unknown> {
  if (!tokens) return {};
  const cats = ["colors", "spacing", "typography", "radii", "shadows", "motion", "breakpoints", "zIndex", "opacity", "borderWidth"] as const;
  const out: Record<string, unknown> = { source: tokens.source };
  for (const c of cats) out[c] = Object.fromEntries(tokens[c]);
  return out;
}

export function writeHandoffArtifacts(dir: string, input: { result: AuditResult; tokens: TokenMap | null }): { findingsPath: string; tokensPath: string } {
  mkdirSync(dir, { recursive: true });
  const findingsPath = join(dir, "findings.json");
  const tokensPath = join(dir, "tokens.json");
  writeFileSync(findingsPath, renderJson(input.result));
  writeFileSync(tokensPath, JSON.stringify(serializeTokenMap(input.tokens), null, 2) + "\n");
  return { findingsPath, tokensPath };
}
