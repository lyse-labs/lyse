import type { StoryIndex } from "../../types.js";
import type { StoryNode, ComponentNode } from "../types.js";

export interface StoryExtractInputs {
  storyIndex: StoryIndex | null;
  componentsModule: string | null;
  dsSelfMode: boolean;
  existingComponentNames: Set<string>;
}

export interface StoryExtraction {
  nodes: StoryNode[];
  seededComponents: ComponentNode[];
}

export function extractStories(inputs: StoryExtractInputs): StoryExtraction {
  if (!inputs.storyIndex) return { nodes: [], seededComponents: [] };

  const nodes: StoryNode[] = [];
  for (const [leaf, entry] of inputs.storyIndex.byTitle) {
    nodes.push({
      id: entry.id,
      title: leaf,
      importPath: entry.importPath,
      componentRef: null,
      hasArgTypes: entry.hasArgTypes ?? false,
      hasArgs: entry.hasArgs ?? false,
      storyExportCount: entry.stories?.length ?? 0,
    });
  }
  nodes.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : 1));

  const seededComponents: ComponentNode[] = [];
  const degraded = inputs.componentsModule === null && !inputs.dsSelfMode;
  if (degraded) {
    for (const [leaf, entry] of inputs.storyIndex.byTitle) {
      const name = leaf;
      if (inputs.existingComponentNames.has(name)) continue;
      if (seededComponents.some((c) => c.name === name)) continue;
      seededComponents.push({
        name,
        file: null,
        module: "(story)",
        exportKind: "unknown",
        usageCount: 0,
        props: [],
        isDsComponent: false,
        storyRefs: [entry.id],
        detection: "story-backref",
      });
    }
    seededComponents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  return { nodes, seededComponents };
}
