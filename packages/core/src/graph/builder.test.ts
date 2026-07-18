import { describe, it, expect } from "vitest";
import { buildDesignSystemGraph } from "./builder.js";
import type { ParsedFiles, StoryIndex } from "../types.js";

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
