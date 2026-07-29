import type { ComponentInventoryEntry } from "../../types.js";
import type { ComponentNode, ComponentDetection } from "../types.js";

export interface ComponentExtractInputs {
  baseInventory: ComponentInventoryEntry[];
  componentsModule: string | null;
  dsSelfMode: boolean;
  componentFiles: Map<string, string>;
}

export interface ComponentExtraction {
  nodes: ComponentNode[];
}

export function extractComponents(inputs: ComponentExtractInputs): ComponentExtraction {
  const detection: ComponentDetection = inputs.dsSelfMode ? "ds-self" : "module-config";
  const nodes: ComponentNode[] = inputs.baseInventory.map((e) => ({
    name: e.name,
    // Always null: no real file path is available at this layer.
    // `baseInventory` entries (ComponentInventoryEntry) carry only
    // name/module/usageCount/props, and `componentFiles` maps a component
    // name to its full SOURCE TEXT (consumed upstream for prop extraction),
    // never a path — indexing it here would leak whole files into the
    // manifest and AGENTS.md instead of a path.
    file: null,
    module: e.module,
    exportKind: "unknown",
    usageCount: e.usageCount,
    props: e.props ?? [],
    isDsComponent: true,
    storyRefs: [],
    detection,
  }));
  return { nodes };
}
