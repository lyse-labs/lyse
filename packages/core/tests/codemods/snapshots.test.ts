/**
 * Snapshot tests for the 3 auto-fixable codemods.
 *
 * Each fixture in packages/core/snapshots/<rule-slug>/ is an
 * input-<case>.<ext> + expected-<case>.patch pair.  We run the
 * codemod on the input with a deterministic context (defined in
 * FIXTURE_META below) and assert the output equals the expected patch.
 *
 * An empty expected-*.patch means the codemod must return patch:null.
 *
 * To regenerate a snapshot after an intentional behavior change:
 *   1. Run the codemod manually with the context below.
 *   2. Paste the new output into expected-<case>.patch.
 *   3. Commit both together.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyCodemod } from "../../src/codemods/index.js";
import type { Finding, RuleContext } from "../../src/types.js";

const SNAPSHOTS_DIR = join(__dirname, "../../snapshots");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyTokenMap() {
  return {
    colors: new Map<string, string[]>(),
    spacing: new Map<string, string[]>(),
    typography: new Map<string, string[]>(),
    radii: new Map<string, string[]>(),
    shadows: new Map<string, string[]>(),
    motion: new Map<string, string[]>(),
    breakpoints: new Map<string, string[]>(),
    zIndex: new Map<string, string[]>(),
    opacity: new Map<string, string[]>(),
    borderWidth: new Map<string, string[]>(),
    source: "tailwind-v3" as const,
  };
}

function makeColorCtx(colors: Map<string, string[]>): RuleContext {
  return {
    repoRoot: "/r",
    tokens: { ...emptyTokenMap(), colors },
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function makeSpacingCtx(spacing: Map<string, string[]>): RuleContext {
  return {
    repoRoot: "/r",
    tokens: { ...emptyTokenMap(), spacing },
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function makeShadowCtx(componentsModule: string | null): RuleContext {
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function makeFinding(
  ruleId: string,
  axis: string,
  file: string,
  line: number,
  message: string,
): Finding {
  return {
    ruleId: ruleId as Finding["ruleId"],
    axis: axis as Finding["axis"],
    severity: "warning",
    location: { file, line, column: 1 },
    message,
  };
}

// ---------------------------------------------------------------------------
// Fixture metadata
//
// Keyed by `<slug>/<case>` (where <case> is the stem after "input-", e.g.
// "jsx-style" for "input-jsx-style.tsx"). Each entry provides the Finding
// and RuleContext needed to run that fixture through the codemod.
// ---------------------------------------------------------------------------

type FixtureMeta = {
  finding: Finding;
  ctx: RuleContext;
};

const FIXTURE_META: Record<string, FixtureMeta> = {
  // ── tokens-no-hardcoded-color ───────────────────────────────────────────
  "tokens-no-hardcoded-color/jsx-style": {
    finding: makeFinding("tokens/no-hardcoded-color", "tokens", "Button.tsx", 6, "hardcoded color"),
    ctx: makeColorCtx(new Map([["#2563eb", ["primary"]], ["#ffffff", ["white"]]])),
  },
  "tokens-no-hardcoded-color/styled-components": {
    finding: makeFinding("tokens/no-hardcoded-color", "tokens", "Card.tsx", 4, "hardcoded color"),
    ctx: makeColorCtx(new Map([["#2563eb", ["primary"]]])),
  },
  "tokens-no-hardcoded-color/rgba-alpha": {
    finding: makeFinding("tokens/no-hardcoded-color", "tokens", "styles.ts", 2, "hardcoded color"),
    ctx: makeColorCtx(new Map([["rgba(0, 0, 0, 0.5)", ["overlay"]], ["#1f2937", ["neutral-900"]]])),
  },
  "tokens-no-hardcoded-color/css": {
    finding: makeFinding("tokens/no-hardcoded-color", "tokens", "button.css", 2, "hardcoded color"),
    ctx: makeColorCtx(new Map([["#2563eb", ["primary"]], ["#1d4ed8", ["primary-dark"]], ["#ffffff", ["white"]]])),
  },
  "tokens-no-hardcoded-color/no-token-match": {
    finding: makeFinding("tokens/no-hardcoded-color", "tokens", "x.tsx", 1, "hardcoded color"),
    ctx: makeColorCtx(new Map([["#2563eb", ["primary"]]])), // #ff0000 NOT in map
  },

  // ── tokens-no-hardcoded-spacing ─────────────────────────────────────────
  "tokens-no-hardcoded-spacing/exact-px-match": {
    finding: makeFinding("tokens/no-hardcoded-spacing", "tokens", "Card.tsx", 3, "hardcoded spacing"),
    ctx: makeSpacingCtx(new Map([["16", ["4"]], ["8", ["2"]]])),
  },
  "tokens-no-hardcoded-spacing/rem-match": {
    finding: makeFinding("tokens/no-hardcoded-spacing", "tokens", "styles.ts", 2, "hardcoded spacing"),
    ctx: makeSpacingCtx(new Map([["1.5", ["6"]], ["0.875", ["3.5"]]])),
  },
  "tokens-no-hardcoded-spacing/multiple-match": {
    finding: makeFinding("tokens/no-hardcoded-spacing", "tokens", "x.tsx", 1, "hardcoded spacing"),
    ctx: makeSpacingCtx(new Map([["8", ["2", "sm"]]])),
  },
  "tokens-no-hardcoded-spacing/no-match": {
    finding: makeFinding("tokens/no-hardcoded-spacing", "tokens", "x.tsx", 1, "hardcoded spacing"),
    ctx: makeSpacingCtx(new Map([["16", ["4"]]])), // 13 NOT in map
  },
  "tokens-no-hardcoded-spacing/css-file": {
    finding: makeFinding("tokens/no-hardcoded-spacing", "tokens", "card.css", 2, "hardcoded spacing"),
    ctx: makeSpacingCtx(new Map([["24", ["6"]]])),
  },

  // ── components-shadow-native ────────────────────────────────────────────
  "components-shadow-native/simple-button": {
    finding: makeFinding("components/no-native-shadows", "components", "SubmitButton.tsx", 5,
      "Native <button> used where <Button> from @acme/ui is available"),
    ctx: makeShadowCtx("@acme/ui"),
  },
  "components-shadow-native/with-classname-multiline": {
    finding: makeFinding("components/no-native-shadows", "components", "Nav.tsx", 7,
      "Native <button> used where <Button> from @acme/ui is available"),
    ctx: makeShadowCtx("@acme/ui"),
  },
  "components-shadow-native/anchor-to-link": {
    finding: makeFinding("components/no-native-shadows", "components", "Footer.tsx", 6,
      "Native <a> used where <Link> from @acme/ui is available"),
    ctx: makeShadowCtx("@acme/ui"),
  },
  "components-shadow-native/input-self-closing": {
    finding: makeFinding("components/no-native-shadows", "components", "SearchBar.tsx", 5,
      "Native <input> used where <Input> from @acme/ui is available"),
    ctx: makeShadowCtx("@acme/ui"),
  },
  "components-shadow-native/no-components-module": {
    finding: makeFinding("components/no-native-shadows", "components", "SubmitButton.tsx", 5,
      "Native <button> used where <Button> from @acme/ui is available"),
    ctx: makeShadowCtx(null),
  },
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

// Derive the set of slugs to iterate from the fixture metadata keys.
const RULE_SLUGS = [...new Set(Object.keys(FIXTURE_META).map((k) => k.split("/")[0]!))];

for (const slug of RULE_SLUGS) {
  describe(`snapshot: ${slug}`, () => {
    const dir = join(SNAPSHOTS_DIR, slug);
    if (!existsSync(dir)) {
      it.skip("no fixtures directory", () => {});
      return;
    }

    const inputFiles = readdirSync(dir)
      .filter((f) => f.startsWith("input-"))
      .sort();

    if (inputFiles.length === 0) {
      it.skip("no input fixtures", () => {});
      return;
    }

    for (const inputFile of inputFiles) {
      // Derive the case name from "input-<case>.<ext>" → "<case>"
      const caseName = inputFile.replace(/^input-/, "").replace(/\.[^.]+$/, "");
      const metaKey = `${slug}/${caseName}`;
      const meta = FIXTURE_META[metaKey];

      it(`fixture: ${caseName}`, async () => {
        if (!meta) {
          // No metadata = we can't invoke the codemod without context.
          // Skip rather than fail — add metadata to FIXTURE_META to enable.
          console.warn(`[snapshots] No metadata for fixture ${metaKey} — skipping`);
          return;
        }

        const inputPath = join(dir, inputFile);
        const source = readFileSync(inputPath, "utf8");

        // Derive the path the codemod expects from the finding location
        const filePath = meta.finding.location.file;

        // Route through the real production adapter — same path as production code.
        const result = await applyCodemod({ source, path: filePath, finding: meta.finding, ctx: meta.ctx });

        // Derive expected patch path: input-<case>.<ext> → expected-<case>.patch
        const expectedFile = inputFile.replace(/^input-/, "expected-").replace(/\.[^.]+$/, ".patch");
        const expectedPath = join(dir, expectedFile);

        const expectedRaw = existsSync(expectedPath) ? readFileSync(expectedPath, "utf8") : "";
        // Empty expected file → codemod must produce patch:null
        const expected = expectedRaw.trim() === "" ? null : expectedRaw;

        expect(result.patch).toBe(expected);
      });
    }
  });
}
