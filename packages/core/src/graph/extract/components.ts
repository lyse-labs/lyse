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
    file: inputs.componentFiles.get(e.name) ?? null,
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
