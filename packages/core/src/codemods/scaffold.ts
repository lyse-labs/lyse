import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A scaffold to generate: a new file that satisfies a detection rule a repo is
 * currently failing for *absence*. Scaffolds never overwrite an existing file —
 * `computeMissingScaffolds` only proposes targets none of whose search paths
 * exist yet (idempotent).
 */
export interface Scaffold {
  /** Stable id (the rule/area this scaffold satisfies). */
  id: string;
  /** Path (relative to repo root) to create. */
  path: string;
  /** File content — generated to pass the corresponding detection rule. */
  content: string;
}

interface ScaffoldTarget {
  id: string;
  /** If ANY of these (relative) paths exist, the target is satisfied — skip it. */
  existsPaths: string[];
  /** Where to create the file when missing. */
  createPath: string;
  content: (repoRoot: string) => string;
}

function readDsName(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { name?: string };
    if (typeof pkg.name === "string" && pkg.name.length > 0) {
      // strip an npm scope for the human title
      return pkg.name.replace(/^@[^/]+\//, "");
    }
  } catch {
    // no/invalid package.json
  }
  return "Design System";
}

function llmsTxt(repoRoot: string): string {
  const name = readDsName(repoRoot);
  return `# ${name}

> A design system for AI agents and humans.

## Documentation

- [Getting started](https://example.com/getting-started): How to install and use ${name}.
- [Components](https://example.com/components): Component API reference.
`;
}

function agentsMd(_repoRoot: string): string {
  return `# Agent guide

Conventions and commands for AI agents working in this repository.

## Setup

Install dependencies and build:

\`\`\`bash
pnpm install
pnpm build
\`\`\`

A non-zero exit code means the command failed. Available scripts and toolchain
configuration live in \`package.json\` and \`tsconfig.json\`.
`;
}

const TARGETS: readonly ScaffoldTarget[] = [
  {
    id: "ai-surface/llms-txt-structure",
    existsPaths: ["llms.txt"],
    createPath: "llms.txt",
    content: llmsTxt,
  },
  {
    id: "ai-surface/agents-md-quality",
    existsPaths: ["AGENTS.md", ".github/AGENTS.md", "docs/AGENTS.md"],
    createPath: "AGENTS.md",
    content: agentsMd,
  },
];

/**
 * Returns the scaffolds for AI-readiness files the repo is missing. A target is
 * skipped when any of its known search paths already exists, so running twice is
 * a no-op (idempotent). Pure: reads the filesystem but writes nothing.
 */
export function computeMissingScaffolds(repoRoot: string): Scaffold[] {
  const out: Scaffold[] = [];
  for (const t of TARGETS) {
    const present = t.existsPaths.some((p) => existsSync(join(repoRoot, p)));
    if (present) continue;
    out.push({ id: t.id, path: t.createPath, content: t.content(repoRoot) });
  }
  return out;
}
