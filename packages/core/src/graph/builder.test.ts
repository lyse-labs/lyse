import { describe, it, expect } from "vitest";
import { buildDesignSystemGraph } from "./builder.js";
import type { ParsedFiles, ParsedTsFile, StoryIndex } from "../types.js";
import type { DsFamilyMember } from "../detection/types.js";

function tsFile(path: string, moduleName: string): ParsedTsFile {
  return {
    path,
    ast: null,
    source: "",
    imports: [{ module: moduleName, named: [], default: null, line: 1 }],
  };
}

const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function storyIndex(): StoryIndex {
  return { byTitle: new Map([["Button", { id: "button", importPath: "src/Button.stories.tsx", hasArgTypes: false, hasArgs: false }]]) };
}

describe("buildDesignSystemGraph", () => {
  it("links story-seeded components and reports stories ok on a degraded-detection repo", async () => {
    const g = await buildDesignSystemGraph({
      repoRoot: process.cwd(),
      parsed,
      fileContents: new Map([["src/App.tsx", "export const App = () => null;"]]),
      componentsModule: null,
      dsSelfMode: false,
      storyIndex: storyIndex(),
      excludePaths: [],
      baseInventory: [],
      componentFiles: new Map(),
    });
    expect(g.schemaVersion).toBe(1);
    const button = g.components.find((c) => c.name === "Button");
    expect(button?.detection).toBe("story-backref");
    expect(button?.storyRefs).toEqual(["button"]);
    expect(g.stories[0]?.componentRef).toBe("Button");
    const stories = g.extraction.entries.find((e) => e.extractor === "stories");
    expect(stories?.status).toBe("ok");
  });

  it("is byte-identical across two builds on the same input (determinism)", async () => {
    const input = {
      repoRoot: process.cwd(), parsed,
      fileContents: new Map([["src/App.tsx", "x"]]),
      componentsModule: null as string | null, dsSelfMode: false,
      storyIndex: storyIndex(), excludePaths: [], baseInventory: [], componentFiles: new Map<string, string>(),
    };
    const a = await buildDesignSystemGraph(input);
    const b = await buildDesignSystemGraph(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("computeUsage — design-system family", () => {
  it("counts imports of every design-system family member, not just the primary", async () => {
    const dsFamily: DsFamilyMember[] = [
      { name: "@acme/core", relDir: "packages/core" },
      { name: "@acme/icons", relDir: "packages/icons" },
    ];
    const graph = await buildDesignSystemGraph({
      repoRoot: process.cwd(),
      parsed: { ts: [tsFile("a.ts", "@acme/core"), tsFile("b.ts", "@acme/icons")], css: [], cssInJs: [] },
      fileContents: new Map(),
      componentsModule: "@acme/core",
      dsFamily,
      dsSelfMode: true,
      storyIndex: null,
      excludePaths: [],
      baseInventory: [],
      componentFiles: new Map(),
    });
    expect(graph.usage).toEqual([
      { file: "a.ts", kind: "imports-ds-module", count: 1 },
      { file: "b.ts", kind: "imports-ds-module", count: 1 },
    ]);
  });

  it("falls back to the single module when there is no family", async () => {
    const graph = await buildDesignSystemGraph({
      repoRoot: process.cwd(),
      parsed: { ts: [tsFile("a.ts", "@mui/material"), tsFile("b.ts", "@acme/icons")], css: [], cssInJs: [] },
      fileContents: new Map(),
      componentsModule: "@mui/material",
      dsSelfMode: false,
      storyIndex: null,
      excludePaths: [],
      baseInventory: [],
      componentFiles: new Map(),
    });
    expect(graph.usage.map((u) => u.file)).toEqual(["a.ts"]);
  });

  it("falls back to the single module when dsFamily is explicitly [] — the shape production actually sends, not just omitted", async () => {
    // build-io.ts always passes a non-optional array and audit-pipeline.ts
    // initialises dsFamily = []; neither ever omits the field or passes
    // undefined. This pins that shape so a future guard rewrite (e.g.
    // `family.length > 0` -> `inputs.dsFamily !== undefined`) cannot silently
    // zero out usage for every repo with a configured or detected single
    // componentsModule while the "no family" test above keeps passing.
    const graph = await buildDesignSystemGraph({
      repoRoot: process.cwd(),
      parsed: { ts: [tsFile("a.ts", "@mui/material"), tsFile("b.ts", "@acme/icons")], css: [], cssInJs: [] },
      fileContents: new Map(),
      componentsModule: "@mui/material",
      dsFamily: [],
      dsSelfMode: false,
      storyIndex: null,
      excludePaths: [],
      baseInventory: [],
      componentFiles: new Map(),
    });
    expect(graph.usage.map((u) => u.file)).toEqual(["a.ts"]);
  });
});
