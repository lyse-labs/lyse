import { extractTokens } from "./extract/tokens.js";
import { extractComponents } from "./extract/components.js";
import { extractStories } from "./extract/stories.js";
import { buildZoneMap } from "./zones.js";
import type { ParsedFiles, ComponentInventoryEntry, StoryIndex } from "../types.js";
import type {
  DesignSystemGraph, ComponentNode, StoryNode, UsageEdgeAggregate,
  ExtractionReportEntry, ExtractionReport,
} from "./types.js";

export interface GraphInputs {
  repoRoot: string;
  parsed: ParsedFiles;
  fileContents: Map<string, string>;
  componentsModule: string | null;
  dsSelfMode: boolean;
  storyIndex: StoryIndex | null;
  excludePaths: string[];
  baseInventory: ComponentInventoryEntry[];
  componentFiles: Map<string, string>;
}

const CONFIG_HINT = "docs/guide/configuration.md";

export async function buildDesignSystemGraph(inputs: GraphInputs): Promise<DesignSystemGraph> {
  const tokenExtraction = await extractTokens(inputs.repoRoot, inputs.parsed, inputs.fileContents);

  const componentExtraction = extractComponents({
    baseInventory: inputs.baseInventory,
    componentsModule: inputs.componentsModule,
    dsSelfMode: inputs.dsSelfMode,
    componentFiles: inputs.componentFiles,
  });
  const baseNames = new Set(componentExtraction.nodes.map((c) => c.name));

  const storyExtraction = extractStories({
    storyIndex: inputs.storyIndex,
    componentsModule: inputs.componentsModule,
    dsSelfMode: inputs.dsSelfMode,
    existingComponentNames: baseNames,
  });

  const components: ComponentNode[] = [...componentExtraction.nodes, ...storyExtraction.seededComponents];
  const byName = new Map(components.map((c) => [c.name, c]));

  const stories: StoryNode[] = storyExtraction.nodes.map((s): StoryNode => {
    const entry = inputs.storyIndex?.byTitle.get(s.title);
    const ref =
      byName.has(s.title) ? s.title
      : entry?.componentName && byName.has(entry.componentName) ? entry.componentName
      : null;
    if (ref) {
      const comp = byName.get(ref)!;
      if (!comp.storyRefs.includes(s.id)) comp.storyRefs.push(s.id);
    }
    return { ...s, componentRef: ref };
  });
  for (const c of components) c.storyRefs = [...new Set(c.storyRefs)].sort();

  components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
  tokenExtraction.nodes.sort((a, b) =>
    a.axis !== b.axis ? (a.axis < b.axis ? -1 : 1)
    : a.id !== b.id ? (a.id < b.id ? -1 : 1)
    : a.rawValue !== b.rawValue ? (a.rawValue < b.rawValue ? -1 : 1)
    : a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );

  const usage = computeUsage(inputs).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const files = [...inputs.fileContents]
    .map(([rel, source]) => ({ rel, source }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const zones = buildZoneMap(files, { excludePaths: inputs.excludePaths, dsSelfMode: inputs.dsSelfMode });

  const extraction: ExtractionReport = {
    entries: buildReport(tokenExtraction.nodes.length, tokenExtraction.sources.length,
      componentExtraction.nodes.length, storyExtraction.seededComponents.length,
      inputs.storyIndex, inputs.dsSelfMode, stories, files.length),
    conflicts: tokenExtraction.conflicts,
  };

  return { schemaVersion: 1, tokens: tokenExtraction.nodes, components, stories, usage, zones, extraction };
}

function computeUsage(inputs: GraphInputs): UsageEdgeAggregate[] {
  if (inputs.componentsModule === null) return [];
  const mod = inputs.componentsModule;
  const out: UsageEdgeAggregate[] = [];
  for (const f of inputs.parsed.ts) {
    const count = f.imports.filter((i) => i.module === mod).length;
    if (count > 0) out.push({ file: f.path, kind: "imports-ds-module", count });
  }
  return out;
}

function buildReport(
  tokenNodes: number, tokenSources: number, baseComponents: number, storySeeded: number,
  storyIndex: StoryIndex | null, dsSelfMode: boolean, stories: StoryNode[], fileCount: number,
): ExtractionReportEntry[] {
  const linked = stories.filter((s) => s.componentRef !== null).length;
  const storyFiles = storyIndex ? storyIndex.byTitle.size : 0;

  const tokens: ExtractionReportEntry = tokenNodes > 0
    ? { extractor: "tokens", status: "ok", evidence: { tokenNodes, tokenSources }, remediation: null }
    : { extractor: "tokens", status: "degraded", evidence: { tokenNodes: 0, tokenSources: 0 },
        remediation: `No token registry detected — add a DTCG (*.tokens.json), Tailwind, or CSS custom-property source, then run \`lyse init\` (${CONFIG_HINT}).` };

  const componentsEntry: ExtractionReportEntry = baseComponents > 0
    ? { extractor: "components", status: "ok", evidence: { components: baseComponents, storySeeded }, remediation: null }
    : { extractor: "components", status: "degraded", evidence: { components: 0, storySeeded },
        remediation: `No component inventory — set \`designSystem.componentsModule\` in .lyse.yaml or run \`lyse init\` (${CONFIG_HINT}).` };

  const storiesEntry: ExtractionReportEntry =
    storyIndex === null
      ? { extractor: "stories", status: "ok", evidence: { storyFiles: 0, linked: 0 }, remediation: null }
      : dsSelfMode
        ? { extractor: "stories", status: "degraded", evidence: { storyFiles, linked: 0 },
            remediation: "DS-self mode: story analysis is skipped in v0.x — the stories axis reports N/A by design." }
        : { extractor: "stories", status: "ok", evidence: { storyFiles, linked }, remediation: null };

  const zones: ExtractionReportEntry = { extractor: "zones", status: "ok", evidence: { files: fileCount }, remediation: null };

  return [componentsEntry, storiesEntry, tokens, zones].sort((a, b) =>
    a.extractor < b.extractor ? -1 : a.extractor > b.extractor ? 1 : 0,
  );
}
