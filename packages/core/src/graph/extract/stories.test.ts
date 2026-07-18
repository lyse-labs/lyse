import { describe, it, expect } from "vitest";
import { extractStories } from "./stories.js";
import type { StoryIndex } from "../../types.js";

function index(entries: Array<[string, { id: string; importPath: string; componentName?: string; hasArgTypes?: boolean; hasArgs?: boolean; storiesLen?: number }]>): StoryIndex {
  const byTitle = new Map();
  for (const [leaf, e] of entries) {
    byTitle.set(leaf, {
      id: e.id, importPath: e.importPath,
      ...(e.componentName !== undefined ? { componentName: e.componentName } : {}),
      hasArgTypes: e.hasArgTypes ?? false, hasArgs: e.hasArgs ?? false,
      ...(e.storiesLen ? { stories: Array.from({ length: e.storiesLen }, (_, i) => ({ name: `S${i}` })) } : {}),
    });
  }
  return { byTitle };
}

describe("extractStories", () => {
  it("emits a StoryNode per story entry", () => {
    const out = extractStories({
      storyIndex: index([["Button", { id: "button", importPath: "src/Button.stories.tsx", hasArgTypes: true, storiesLen: 2 }]]),
      componentsModule: "@acme/ui", dsSelfMode: false, existingComponentNames: new Set(["Button"]),
    });
    expect(out.nodes).toEqual([
      { id: "button", title: "Button", importPath: "src/Button.stories.tsx", componentRef: null, hasArgTypes: true, hasArgs: false, storyExportCount: 2 },
    ]);
    expect(out.seededComponents).toEqual([]);
  });

  it("SEEDS component candidates from story titles when detection degraded (Appendix-A fix)", () => {
    const out = extractStories({
      storyIndex: index([
        ["Accordion", { id: "accordion", importPath: "src/Accordion.stories.tsx" }],
        ["Button", { id: "button", importPath: "src/Button.stories.tsx" }],
      ]),
      componentsModule: null, dsSelfMode: false, existingComponentNames: new Set(),
    });
    expect(out.seededComponents.map((c) => c.name)).toEqual(["Accordion", "Button"]);
    expect(out.seededComponents[0]).toEqual({
      name: "Accordion", file: null, module: "(story)", exportKind: "unknown",
      usageCount: 0, props: [], isDsComponent: false, storyRefs: ["accordion"], detection: "story-backref",
    });
  });

  it("does NOT seed when a module is configured", () => {
    const out = extractStories({
      storyIndex: index([["Button", { id: "button", importPath: "src/Button.stories.tsx" }]]),
      componentsModule: "@acme/ui", dsSelfMode: false, existingComponentNames: new Set(),
    });
    expect(out.seededComponents).toEqual([]);
  });

  it("does NOT seed in dsSelfMode", () => {
    const out = extractStories({
      storyIndex: index([["Button", { id: "button", importPath: "src/Button.stories.tsx" }]]),
      componentsModule: null, dsSelfMode: true, existingComponentNames: new Set(),
    });
    expect(out.seededComponents).toEqual([]);
  });

  it("returns empty for a null story index", () => {
    expect(extractStories({ storyIndex: null, componentsModule: null, dsSelfMode: false, existingComponentNames: new Set() }))
      .toEqual({ nodes: [], seededComponents: [] });
  });
});
