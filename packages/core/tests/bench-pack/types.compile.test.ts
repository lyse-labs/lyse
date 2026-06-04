import { describe, it, expect } from "vitest";
import type { EvidencePack } from "../../src/bench/evidence-pack/types.js";

describe("EvidencePack types", () => {
  it("compiles with the documented top-level shape", () => {
    const pack: EvidencePack = {
      schemaVersion: "bench-pack/1.0",
      extractedAt: "2026-05-26T08:00:00.000Z",
      lyseCliVersion: "0.1.0-alpha.1",
      repo: {
        owner: "x",
        name: "y",
        headSha: "deadbeef",
        primaryLanguage: "TypeScript",
        frameworks: ["react"],
        monorepoLayout: "pnpm-workspace",
        subpackages: ["packages/ui"],
      },
      manifests: {
        agentsMd: { present: false },
        claudeMd: { present: false },
        designMd: { present: false },
        skillMd: { present: false },
        componentsJson: { present: false },
        cursorRules: { present: false },
        llmsTxt: { present: false },
        llmsFullTxt: { present: false },
        mcpConfig: { present: false },
        tokensJsonDtcg: { present: false },
      },
      packageJsonDigest: { root: null, subpackages: [] },
      histograms: {
        tokenDiscipline: {
          filesScanned: 0,
          inlineLiteralsPerFile: { p50: 0, p90: 0, p99: 0 },
          semanticTokenReferences: 0,
          rawHexCount: 0,
          rawRgbaCount: 0,
          rawPxCount: 0,
        },
        a11yAttributes: {
          ariaAttrCount: 0,
          altAttrCount: 0,
          roleAttrCount: 0,
          tabIndexCount: 0,
          focusManagementHookCount: 0,
        },
        storyFiles: { count: 0, extensions: {}, totalCharCount: 0 },
        testFiles: { count: 0, extensions: {}, framework: null },
      },
      canonicalSamples: {
        primitiveComponents: [],
        compoundComponents: [],
        layoutComponents: [],
        formComponents: [],
        stories: [],
        tests: [],
        tokenFiles: [],
        configFiles: [],
      },
      verifierCorpus: { totalBytes: 0, fileOffsets: [], corpus: "" },
    };
    expect(pack.schemaVersion).toBe("bench-pack/1.0");
  });
});
