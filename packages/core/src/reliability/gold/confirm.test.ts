import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { confirmCandidate } from "./confirm.js";
import { walkTokenizationCommits, type CandidateChange } from "./walk.js";

interface Repo {
  dir: string;
  commit: string;
  parent: string;
}

const created: string[] = [];

function makeRepo(
  prefix: string,
  parentFiles: Record<string, string>,
  childFiles: Record<string, string>,
): Repo {
  const dir = mkdtempSync(join(tmpdir(), `gold-confirm-${prefix}-`));
  created.push(dir);
  const run = (args: string[]): void => {
    execFileSync("git", args, { cwd: dir });
  };
  run(["init", "-q"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);
  run(["config", "commit.gpgsign", "false"]);
  for (const [path, content] of Object.entries(parentFiles)) {
    writeFileSync(join(dir, path), content);
  }
  run(["add", "."]);
  run(["commit", "-qm", "parent"]);
  const parent = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
  for (const [path, content] of Object.entries(childFiles)) {
    writeFileSync(join(dir, path), content);
  }
  run(["add", "."]);
  run(["commit", "-qm", "child"]);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
  return { dir, commit, parent };
}

async function onlyCandidate(dir: string, repoName: string): Promise<CandidateChange> {
  const candidates = await walkTokenizationCommits(dir, repoName);
  expect(candidates).toHaveLength(1);
  const candidate = candidates[0];
  if (candidate === undefined) throw new Error("no candidate produced by walk");
  return candidate;
}

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

describe("gold/confirm confirmCandidate", () => {
  it("CSS positive (positive-css-var): border-bottom-color hex -> var() with in-repo token def => GoldLabel", async () => {
    const repo = makeRepo(
      "css",
      {
        "underline-nav.scss": ".x {\n  border-bottom-color: #f9826c;\n}\n",
        "tokens.scss": ":root {\n  --color-underlinenav-border-active: #f9826c;\n}\n",
      },
      {
        "underline-nav.scss": ".x {\n  border-bottom-color: var(--color-underlinenav-border-active);\n}\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "primer-css");
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toEqual({
      repo: candidate.repo,
      commit: repo.commit,
      parent: repo.parent,
      file: "underline-nav.scss",
      line: candidate.line,
      literal: "#f9826c",
      expectedToken: "var(--color-underlinenav-border-active)",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("CSS positive 2 (positive-css-var-2): background hex -> var(--primary) with in-repo --primary def => GoldLabel", async () => {
    const repo = makeRepo(
      "css2",
      {
        "button.scss": ".x {\n  background: #008060;\n}\n",
        "globals.scss": "body {\n  --primary: #008060;\n}\n",
      },
      {
        "button.scss": ".x {\n  background: var(--primary);\n}\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "polaris");
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toEqual({
      repo: candidate.repo,
      commit: repo.commit,
      parent: repo.parent,
      file: "button.scss",
      line: candidate.line,
      literal: "#008060",
      expectedToken: "var(--primary)",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("JS positive (positive-js-token): const glow = base.orange400 with in-repo token source => GoldLabel", async () => {
    const repo = makeRepo(
      "js",
      {
        "comp.tsx": "const glowHappyHour = '#FD7E00';\n",
        "tokens.ts": 'export const base = {\n  orange400: "#FD7E00",\n};\n',
      },
      {
        "comp.tsx": "const glowHappyHour = base.orange400; //'#FD7E00'\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "canvas-kit");
    expect(candidate.addedRef).toBe("base.orange400");
    expect(candidate.removedLiteral).toBe("#FD7E00");
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toEqual({
      repo: candidate.repo,
      commit: repo.commit,
      parent: repo.parent,
      file: "comp.tsx",
      line: candidate.line,
      literal: "#FD7E00",
      expectedToken: "base.orange400",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("CSS negative — value CHANGE (negative-value-change): #ff0 -> var(--color-attention-subtle: #fff8c5) => null (Gate B rejects)", async () => {
    const repo = makeRepo(
      "neg",
      {
        "normalize.scss": "mark {\n  background-color: #ff0;\n}\n",
        "tokens.scss": ":root {\n  --color-attention-subtle: #fff8c5;\n}\n",
      },
      {
        "normalize.scss": "mark {\n  background-color: var(--color-attention-subtle);\n}\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "primer-css");
    expect(candidate.removedLiteral).toBe("#ff0");
    expect(candidate.addedRef).toBe("var(--color-attention-subtle)");
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("Tangled AST-slot reject (synthetic): literal in `color:` but ref added to `background:` => null (Gate A rejects even though value matches)", async () => {
    const repo = makeRepo(
      "slot",
      {
        "x.scss": ".a {\n  color: #f00;\n  background: #0f0;\n}\n",
        "tokens.scss": ":root {\n  --brand: #f00;\n}\n",
      },
      {
        "x.scss": ".a {\n  color: red;\n  background: var(--brand);\n}\n",
      },
    );
    // Constructed directly: walk pairs strictly by property/identifier, so it
    // would never emit this cross-slot pairing. The literal (#f00) came from the
    // `color:` slot; the ref (var(--brand)) was added to the `background:` slot.
    // Gate B WOULD pass here (--brand == #f00), isolating Gate A as the rejecter.
    const candidate: CandidateChange = {
      repo: "synthetic",
      commit: repo.commit,
      parent: repo.parent,
      file: "x.scss",
      removedLiteral: "#f00",
      addedRef: "var(--brand)",
      line: 3,
      massCodemod: false,
    };
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("JS false-accept closed (unscoped-resolution exploit): real base.orange400 changed to #ABCDEF while an unrelated legacy file still defines orange400=#FD7E00 => null", async () => {
    const repo = makeRepo(
      "js-false-accept",
      {
        "comp.tsx": "const glowHappyHour = '#FD7E00';\n",
        "tokens.ts": 'export const base = {\n  orange400: "#FD7E00",\n};\n',
        "legacy-palette.ts": 'export const legacy = {\n  orange400: "#FD7E00",\n};\n',
      },
      {
        // The REAL token moved to a new colour...
        "tokens.ts": 'export const base = {\n  orange400: "#ABCDEF",\n};\n',
        // ...but the tokenization still stashes the OLD literal in the comment,
        // and legacy-palette.ts (unrelated) keeps orange400 = the OLD literal.
        "comp.tsx": "const glowHappyHour = base.orange400; //'#FD7E00'\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "canvas-kit");
    expect(candidate.addedRef).toBe("base.orange400");
    expect(candidate.removedLiteral).toBe("#FD7E00");
    // Before the fix, the whole-repo last-segment grep found legacy-palette.ts's
    // orange400 = #FD7E00 and accept-on-any-match emitted a GoldLabel even though
    // the real base.orange400 now resolves to #ABCDEF. First-segment scoping
    // (base) excludes legacy-palette.ts, and the disagreement gate is the backstop.
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("CSS multi-def ambiguity closed: --x defined with two different values (light + dark) => null (ambiguous)", async () => {
    const repo = makeRepo(
      "css-multidef",
      {
        "button.scss": ".x {\n  background: #111111;\n}\n",
        "tokens.scss":
          ":root {\n  --x: #111111;\n}\n.dark {\n  --x: #222222;\n}\n",
      },
      {
        "button.scss": ".x {\n  background: var(--x);\n}\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "some-ds");
    expect(candidate.removedLiteral).toBe("#111111");
    expect(candidate.addedRef).toBe("var(--x)");
    // --x resolves to BOTH #111111 and #222222. Accept-on-any-match would pass
    // (removedLiteral == #111111), but the resolution is ambiguous => fail closed.
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("Gate A CSS selector scope: same property+literal in a DIFFERENT selector must not satisfy Gate A for the changed rule", async () => {
    // REJECT: the changed rule (.a) actually held #0000ff; #f00 lives only in an
    // unrelated rule (.b). A file-scoped Gate A would wrongly accept.
    const rejectRepo = makeRepo(
      "css-selscope-reject",
      {
        "x.scss": ".a {\n  color: #0000ff;\n}\n.b {\n  color: #f00;\n}\n",
        "tokens.scss": ":root {\n  --brand: #f00;\n}\n",
      },
      {
        "x.scss": ".a {\n  color: var(--brand);\n}\n.b {\n  color: #f00;\n}\n",
      },
    );
    const rejectCandidate: CandidateChange = {
      repo: "synthetic",
      commit: rejectRepo.commit,
      parent: rejectRepo.parent,
      file: "x.scss",
      removedLiteral: "#f00",
      addedRef: "var(--brand)",
      line: 2,
      massCodemod: false,
    };
    expect(await confirmCandidate(rejectRepo.dir, rejectCandidate)).toBeNull();

    // ACCEPT: the changed rule (.a) genuinely held #f00; a different rule (.b)
    // carries an unrelated colour. The changed rule's own prior value governs.
    const acceptRepo = makeRepo(
      "css-selscope-accept",
      {
        "x.scss": ".a {\n  color: #f00;\n}\n.b {\n  color: #0000ff;\n}\n",
        "tokens.scss": ":root {\n  --brand: #f00;\n}\n",
      },
      {
        "x.scss": ".a {\n  color: var(--brand);\n}\n.b {\n  color: #0000ff;\n}\n",
      },
    );
    const acceptCandidate: CandidateChange = {
      repo: "synthetic",
      commit: acceptRepo.commit,
      parent: acceptRepo.parent,
      file: "x.scss",
      removedLiteral: "#f00",
      addedRef: "var(--brand)",
      line: 2,
      massCodemod: false,
    };
    expect(await confirmCandidate(acceptRepo.dir, acceptCandidate)).toEqual({
      repo: "synthetic",
      commit: acceptRepo.commit,
      parent: acceptRepo.parent,
      file: "x.scss",
      line: 2,
      literal: "#f00",
      expectedToken: "var(--brand)",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("JS residual exploit closed (present-but-unextractable owner block): real base.orange400 changed to computeColor(...) while an unrelated file also declares base with the OLD literal as a quoted string => null", async () => {
    const repo = makeRepo(
      "js-residual-exploit",
      {
        "comp.tsx": "const glowHappyHour = '#FD7E00';\n",
        // The REAL owner object: orange400 now holds a call expression (a value
        // CHANGE), NOT a quoted colour — nothing is extractable from this block.
        "tokens.ts": "export const base = {\n  orange400: computeColor(999, 999, 999),\n};\n",
        // An unrelated module ALSO declares an object named `base` whose
        // orange400 still carries the OLD literal (owner-name collisions on
        // base/colors/theme are ordinary in DS repos).
        "legacy-tokens.ts": 'export const base = {\n  orange400: "#FD7E00",\n};\n',
      },
      {
        "comp.tsx": "const glowHappyHour = base.orange400; //'#FD7E00'\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "canvas-kit");
    expect(candidate.addedRef).toBe("base.orange400");
    expect(candidate.removedLiteral).toBe("#FD7E00");
    // The real owner block has orange400 present-but-unextractable
    // (computeColor(...)), so resolution fails closed to [] instead of falling
    // through to legacy-tokens.ts's stale "#FD7E00". No GoldLabel is fabricated.
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("JS external owner => null: base is only imported (no in-repo object-literal decl) so base.orange400 is unresolved", async () => {
    const repo = makeRepo(
      "js-external-owner",
      {
        "comp.tsx": "const glowHappyHour = '#FD7E00';\n",
      },
      {
        "comp.tsx":
          'import { base } from "@workday/canvas-tokens-web";\nconst glowHappyHour = base.orange400; //\'#FD7E00\'\n',
      },
    );
    const candidate = await onlyCandidate(repo.dir, "canvas-kit");
    expect(candidate.addedRef).toBe("base.orange400");
    expect(candidate.removedLiteral).toBe("#FD7E00");
    // `base` has no in-repo `const base = { ... }` declaration (imported), so
    // there is no owner block to resolve from => [] => null. This is the correct
    // outcome for the real corpus, where JS/TS tokens are external-npm.
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toBeNull();
  });

  it("CSS commented-out var def not resolved: only occurrence of --brand is inside a comment => null; a live def governs when present => GoldLabel", async () => {
    // Only COMMENTED defs exist — a raw-text grep would match them, PostCSS
    // reads real Declaration nodes only and finds nothing.
    const commentedRepo = makeRepo(
      "css-var-commented",
      {
        "x.scss": ".a {\n  color: #f00;\n}\n",
        "tokens.scss": "// --brand: #f00;\n/* --brand: #f00; */\n",
      },
      {
        "x.scss": ".a {\n  color: var(--brand);\n}\n",
      },
    );
    const commentedCandidate = await onlyCandidate(commentedRepo.dir, "some-ds");
    expect(commentedCandidate.removedLiteral).toBe("#f00");
    expect(commentedCandidate.addedRef).toBe("var(--brand)");
    expect(await confirmCandidate(commentedRepo.dir, commentedCandidate)).toBeNull();

    // A LIVE def (#f00) governs even with a commented decoy (#00f) present: the
    // comment is excluded, so resolution is unanimous rather than conflicting.
    const liveRepo = makeRepo(
      "css-var-live",
      {
        "x.scss": ".a {\n  color: #f00;\n}\n",
        "tokens.scss": "// --brand: #00f;\n:root {\n  --brand: #f00;\n}\n",
      },
      {
        "x.scss": ".a {\n  color: var(--brand);\n}\n",
      },
    );
    const liveCandidate = await onlyCandidate(liveRepo.dir, "some-ds");
    expect(await confirmCandidate(liveRepo.dir, liveCandidate)).toEqual({
      repo: liveCandidate.repo,
      commit: liveRepo.commit,
      parent: liveRepo.parent,
      file: "x.scss",
      line: liveCandidate.line,
      literal: "#f00",
      expectedToken: "var(--brand)",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("Gate A JS multi-hunk line-shift still confirms: an earlier insertion shifts the candidate off the parent decl's line, yet the content-match parent check finds it => GoldLabel", async () => {
    const repo = makeRepo(
      "js-line-shift",
      {
        "comp.tsx": "const a = 1;\nconst glowHappyHour = '#FD7E00';\n",
        "tokens.ts": 'export const base = {\n  orange400: "#FD7E00",\n};\n',
      },
      {
        // Three new lines are inserted BEFORE the candidate declaration, so the
        // child's glowHappyHour sits at line 5 while the parent's was at line 2
        // — well outside the old ±1 window (which would have false-rejected).
        "comp.tsx":
          "const a = 1;\nconst pad1 = 2;\nconst pad2 = 3;\nconst pad3 = 4;\nconst glowHappyHour = base.orange400; //'#FD7E00'\n",
      },
    );
    const candidate = await onlyCandidate(repo.dir, "canvas-kit");
    expect(candidate.addedRef).toBe("base.orange400");
    expect(candidate.removedLiteral).toBe("#FD7E00");
    expect(candidate.line).toBe(5);
    const label = await confirmCandidate(repo.dir, candidate);
    expect(label).toEqual({
      repo: candidate.repo,
      commit: repo.commit,
      parent: repo.parent,
      file: "comp.tsx",
      line: 5,
      literal: "#FD7E00",
      expectedToken: "base.orange400",
      axis: "colors",
      ruleId: "tokens/no-hardcoded-color",
    });
  });

  it("Tangled 10-way value split (tangled-brand-refresh): exact colorEquals accepts 4, rejects 6 (incl. line 33 ±1-LSB boundary)", async () => {
    const pairs: Array<{ line: number; name: string; token: string; literal: string }> = [
      { line: 22, name: "illuminateStopColor1", token: "base.red200", literal: "#FFA198" },
      { line: 23, name: "illuminateStopColor2", token: "base.orange200", literal: "#FFCAA0" },
      { line: 24, name: "illuminateStopColor3", token: "base.orange200", literal: "#FFCA79" },
      { line: 25, name: "illuminateStopColor4", token: "base.amber200", literal: "#FDCA44" },
      { line: 26, name: "illuminateStopColor5", token: "base.amber300", literal: "#FFB74D" },
      { line: 31, name: "glowEraser", token: "base.magenta200", literal: "#FFC2FD" },
      { line: 32, name: "glowHighlighter", token: "base.amber100", literal: "#FFF3A8" },
      { line: 33, name: "glowLunchBreak", token: "base.amber300", literal: "#FEC10B" },
      { line: 34, name: "glowHappyHour", token: "base.orange400", literal: "#FD7E00" },
      { line: 35, name: "glowThumbtack", token: "base.coral500", literal: "#FC5B05" },
    ];

    const parentLines = new Array<string>(35);
    const childLines = new Array<string>(35);
    parentLines[0] = "import { base } from './tokens';";
    childLines[0] = "import { base } from './tokens';";
    for (let i = 1; i <= 20; i++) {
      parentLines[i] = `// filler ${i + 1}`;
      childLines[i] = `// filler ${i + 1}`;
    }
    parentLines[26] = "";
    childLines[26] = "";
    parentLines[27] = "/**";
    childLines[27] = "/**";
    parentLines[28] = " * Box shadow glow colors";
    childLines[28] = " * Box shadow glow colors";
    parentLines[29] = " */";
    childLines[29] = " */";
    for (const pair of pairs) {
      parentLines[pair.line - 1] = `const ${pair.name} = '${pair.literal}';`;
      childLines[pair.line - 1] = `const ${pair.name} = ${pair.token}; //'${pair.literal}'`;
    }

    // In-repo token source mapping each token to its OKLCH->sRGB *computed*
    // value from tangled-brand-refresh.tokendef (NOT the removed literal): the
    // 5 "illuminate" tokens differ from their literals (brand refresh), the 5
    // "glow" tokens match. amber300 = #FEC10C: exact for neither of its two
    // uses (line 26 literal #FFB74D differs a lot; line 33 literal #FEC10B
    // differs by 1 LSB in blue -> see the boundary assertion below).
    const tokensTs = [
      "export const base = {",
      '  red200: "#FFB2A7",',
      '  orange200: "#FFC48A",',
      '  amber200: "#FDE65E",',
      '  amber300: "#FEC10C",',
      '  magenta200: "#FFC2FD",',
      '  amber100: "#FFF3A8",',
      '  orange400: "#FD7E00",',
      '  coral500: "#FC5B05",',
      "};",
      "",
    ].join("\n");

    const repo = makeRepo(
      "tangled",
      {
        "comp.tsx": `${parentLines.join("\n")}\n`,
        "tokens.ts": tokensTs,
      },
      {
        "comp.tsx": `${childLines.join("\n")}\n`,
      },
    );

    const candidates = await walkTokenizationCommits(repo.dir, "canvas-kit");
    expect(candidates).toHaveLength(10);
    const byLine = new Map(candidates.map((c) => [c.line, c]));

    const expectedLabels = new Set([31, 32, 34, 35]);
    for (const pair of pairs) {
      const candidate = byLine.get(pair.line);
      if (candidate === undefined) throw new Error(`no candidate at line ${pair.line}`);
      const label = await confirmCandidate(repo.dir, candidate);
      if (expectedLabels.has(pair.line)) {
        expect(label).toEqual({
          repo: candidate.repo,
          commit: repo.commit,
          parent: repo.parent,
          file: "comp.tsx",
          line: pair.line,
          literal: pair.literal,
          expectedToken: pair.token,
          axis: "colors",
          ruleId: "tokens/no-hardcoded-color",
        });
      } else {
        // WHY line 33 is null: base.amber300 resolves to #FEC10C (254,193,12)
        // while the removed literal is #FEC10B (254,193,11). expected.json's
        // perLinePairs marks line 33 match:true — a HUMAN, ±1-tolerant label.
        // The harness's INDEPENDENT colorEquals is exact (integer rgb), so
        // blue 12 != 11 -> false -> null. This fail-closed exactness is
        // intended: do NOT loosen colorEquals to make line 33 a label.
        expect(label).toBeNull();
      }
    }
  });
});
