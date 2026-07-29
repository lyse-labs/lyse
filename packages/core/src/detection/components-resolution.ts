import type { ComponentInventoryEntry, ParsedFiles } from "../types.js";
import { buildComponentInventory, extractComponentProps } from "../loaders/components.js";
import type { DetectionResult } from "./types.js";

export function resolveComponentsModule(
  configured: string | null,
  detected: DetectionResult<string>,
): { componentsModule: string | null; dsSelfMode: boolean } {
  let componentsModule = configured;
  let dsSelfMode = false;
  if (!componentsModule) {
    componentsModule = detected.value ?? null;
    // When detection source is "workspace DS export", the repo IS the DS itself.
    // Rules like no-native-shadows and stories/coverage have consumer-of-DS semantics
    // and must skip — v0.2 will add DS-self-aware rule variants.
    if (detected.source.startsWith("workspace DS export")) {
      dsSelfMode = true;
    }
  }

  return { componentsModule, dsSelfMode };
}

export function buildInventoryForMode(input: {
  componentsModule: string | null;
  dsSelfMode: boolean;
  parsedTs: ParsedFiles["ts"];
  componentSources: Map<string, string>;
}): ComponentInventoryEntry[] {
  const { componentsModule, dsSelfMode, parsedTs, componentSources } = input;
  // In dsSelfMode the DS audits its own components: they import each other via
  // relative paths so import-counting yields nothing. Build inventory directly
  // from the in-tree PascalCase source files instead (props are still extracted
  // via extractComponentProps so rules like stories/props-documented can fire).
  return dsSelfMode && componentsModule
    ? [...componentSources.entries()].map(([name, src]) => {
        const entry: ComponentInventoryEntry = {
          name,
          module: componentsModule as string,
          usageCount: 0,
        };
        const props = extractComponentProps(name, src);
        if (props !== undefined) entry.props = props;
        return entry;
      })
    : componentsModule
      ? buildComponentInventory(componentsModule, parsedTs, componentSources)
      : [];
}
