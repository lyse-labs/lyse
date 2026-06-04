import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import type {
  HistogramsBlock,
  TokenDisciplineHistogram,
  A11yAttributesHistogram,
  StoryFilesHistogram,
  TestFilesHistogram,
  Percentiles,
} from "./types.js";

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGBA_RE = /\brgba?\(/g;
const PX_RE = /\b\d+(\.\d+)?px\b/g;
const ARIA_RE = /\baria-[a-z]+\s*=/g;
const ALT_RE = /\balt\s*=/g;
const ROLE_RE = /\brole\s*=/g;
const TABINDEX_RE = /\btabIndex\s*=/g;
const FOCUS_HOOK_RE = /\b(useFocusable|useFocusTrap|use[A-Z]\w*Focus\w*)\b/g;
const SEMANTIC_TOKEN_RE = /\b(theme|tokens?)\.[a-zA-Z][\w.]+/g;

function percentiles(values: ReadonlyArray<number>): Percentiles {
  if (values.length === 0) return { p50: 0, p90: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { p50: at(0.5), p90: at(0.9), p99: at(0.99) };
}

function countMatches(re: RegExp, content: string): number {
  return (content.match(re) ?? []).length;
}

async function* iterateSourceFiles(repoRoot: string): AsyncIterable<{ path: string; content: string }> {
  const files = await fg(["**/*.{ts,tsx,js,jsx,css,scss}"], {
    cwd: repoRoot,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.recall-suite-cache/**",
      "**/benchmarks/fixtures/**",
      "**/fixtures/**",
      "**/.tmp/**",
      "**/coverage/**",
    ],
    onlyFiles: true,
  });
  files.sort();
  for (const rel of files) {
    try {
      const content = await readFile(join(repoRoot, rel), "utf8");
      yield { path: rel, content };
    } catch {
      // skip unreadable
    }
  }
}

function detectTestFramework(testFiles: ReadonlyArray<{ content: string }>): string | null {
  for (const f of testFiles) {
    if (/from\s+["']vitest["']/.test(f.content)) return "vitest";
    if (/from\s+["']@jest\/globals["']|require\(["']jest["']\)/.test(f.content)) return "jest";
    if (/from\s+["']mocha["']/.test(f.content)) return "mocha";
  }
  return null;
}

export async function computeHistograms(repoRoot: string): Promise<HistogramsBlock> {
  const td: { filesScanned: number; inline: number[]; semantic: number; hex: number; rgba: number; px: number } = {
    filesScanned: 0, inline: [], semantic: 0, hex: 0, rgba: 0, px: 0,
  };
  const a11y = { aria: 0, alt: 0, role: 0, tabIndex: 0, focusHook: 0 };
  const storyContent: Array<{ ext: string; len: number }> = [];
  const testFiles: Array<{ ext: string; content: string }> = [];

  for await (const { path: rel, content } of iterateSourceFiles(repoRoot)) {
    if (rel.endsWith(".stories.tsx") || rel.endsWith(".stories.ts") || rel.endsWith(".stories.jsx") || rel.endsWith(".stories.js")) {
      const ext = rel.slice(rel.indexOf(".stories"));
      storyContent.push({ ext, len: content.length });
      continue;
    }
    if (rel.endsWith(".test.tsx") || rel.endsWith(".test.ts") || rel.endsWith(".spec.tsx") || rel.endsWith(".spec.ts")) {
      const ext = rel.slice(rel.lastIndexOf("."));
      testFiles.push({ ext, content });
      continue;
    }
    td.filesScanned += 1;
    const hex = countMatches(HEX_RE, content);
    const rgba = countMatches(RGBA_RE, content);
    const px = countMatches(PX_RE, content);
    const inline = hex + rgba + px;
    td.inline.push(inline);
    td.hex += hex;
    td.rgba += rgba;
    td.px += px;
    td.semantic += countMatches(SEMANTIC_TOKEN_RE, content);
    a11y.aria += countMatches(ARIA_RE, content);
    a11y.alt += countMatches(ALT_RE, content);
    a11y.role += countMatches(ROLE_RE, content);
    a11y.tabIndex += countMatches(TABINDEX_RE, content);
    a11y.focusHook += countMatches(FOCUS_HOOK_RE, content);
  }

  const tokenDiscipline: TokenDisciplineHistogram = {
    filesScanned: td.filesScanned,
    inlineLiteralsPerFile: percentiles(td.inline),
    semanticTokenReferences: td.semantic,
    rawHexCount: td.hex,
    rawRgbaCount: td.rgba,
    rawPxCount: td.px,
  };

  const a11yAttributes: A11yAttributesHistogram = {
    ariaAttrCount: a11y.aria,
    altAttrCount: a11y.alt,
    roleAttrCount: a11y.role,
    tabIndexCount: a11y.tabIndex,
    focusManagementHookCount: a11y.focusHook,
  };

  const storyExtensions: Record<string, number> = {};
  let storyTotalChars = 0;
  for (const s of storyContent) {
    storyExtensions[s.ext] = (storyExtensions[s.ext] ?? 0) + 1;
    storyTotalChars += s.len;
  }
  const storyFiles: StoryFilesHistogram = {
    count: storyContent.length,
    extensions: storyExtensions,
    totalCharCount: storyTotalChars,
  };

  const testExtensions: Record<string, number> = {};
  for (const t of testFiles) testExtensions[t.ext] = (testExtensions[t.ext] ?? 0) + 1;
  const testFilesBlock: TestFilesHistogram = {
    count: testFiles.length,
    extensions: testExtensions,
    framework: detectTestFramework(testFiles),
  };

  return { tokenDiscipline, a11yAttributes, storyFiles, testFiles: testFilesBlock };
}
