import { findRuleMeta, RULE_METADATA } from '../rules/manifest.js';
import type { RuleMeta } from '../types.js';

export interface RunExplainArgs {
  cwd: string;
  ruleId: string;
  format?: string;
}

function renderExplainText(meta: RuleMeta): string {
  const lines: string[] = [
    '',
    `  ${meta.id}`,
    `  ${'-'.repeat(meta.id.length + 4)}`,
    '',
    `  axis:             ${meta.axis}`,
    `  default severity: ${meta.defaultSeverity}`,
    `  help:             ${meta.helpUri}`,
    '',
    '  Description',
    '  -----------',
    `  ${meta.fullDescription}`,
    '',
    '  Rationale',
    '  ---------',
    ...meta.rationale.split('\n').map((l) => `  ${l}`),
    '',
    '  Examples',
    '  --------',
    ...meta.examples.flatMap((ex, i) => [
      `  Example ${i + 1}`,
      `    good:  ${ex.good}`,
      `    bad:   ${ex.bad}`,
    ]),
    '',
    '  Allowlist',
    '  ---------',
    ...meta.allowlist.map((a) => `  • ${a}`),
    '',
  ];
  return lines.join('\n');
}

function renderExplainMarkdown(meta: RuleMeta): string {
  return [
    `# \`${meta.id}\``,
    '',
    `**Axis:** ${meta.axis} · **Default severity:** ${meta.defaultSeverity}`,
    '',
    `[Full docs](${meta.helpUri})`,
    '',
    '## Description',
    '',
    meta.fullDescription,
    '',
    '## Rationale',
    '',
    meta.rationale,
    '',
    '## Examples',
    '',
    ...meta.examples.flatMap((ex, i) => [
      `**Example ${i + 1}**`,
      '',
      '✅ Good:',
      '```',
      ex.good,
      '```',
      '',
      '❌ Bad:',
      '```',
      ex.bad,
      '```',
      '',
    ]),
    '## Allowlist',
    '',
    ...meta.allowlist.map((a) => `- ${a}`),
    '',
  ].join('\n');
}

export async function runExplain(args: RunExplainArgs): Promise<void> {
  const meta = findRuleMeta(args.ruleId);
  if (!meta) {
    process.stderr.write(`Unknown rule: ${args.ruleId}\n`);
    process.stderr.write('\n');
    process.stderr.write('Available rules:\n');
    for (const r of RULE_METADATA) process.stderr.write(`  ${r.id}\n`);
    process.exitCode = 64;
    return;
  }

  let staticOutput: string;
  if (args.format === 'md') {
    staticOutput = renderExplainMarkdown(meta);
  } else {
    staticOutput = renderExplainText(meta);
  }
  process.stdout.write(staticOutput);
}
