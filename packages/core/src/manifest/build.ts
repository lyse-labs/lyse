import { computeGraphHash } from "../diff/graph-hash.js";
import type { DesignSystemGraph, UsageEdgeKind, ZoneKind } from "../graph/types.js";
import type { ComponentPropEntry } from "../types.js";
import type {
  DsManifest,
  ManifestProp,
  ManifestUsageSummary,
  ManifestZoneSummary,
} from "./types.js";

// Every zone kind is always emitted: to a consumer, "absent key" and "zero files"
// must not be the same signal.
const ZONE_KINDS: ZoneKind[] = [
  "ds-source",
  "app",
  "story",
  "test",
  "generated",
  "vendored",
  "config",
];

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toProp(prop: ComponentPropEntry): ManifestProp {
  return {
    name: prop.name,
    type: prop.typeText ?? null,
    optional: prop.isOptional ?? false,
    default: prop.defaultValue ?? null,
    variants: prop.isVariantUnion === true ? (prop.variants ?? []) : null,
  };
}

function zoneSummary(byFile: Record<string, ZoneKind>): ManifestZoneSummary {
  const counts = Object.fromEntries(ZONE_KINDS.map((k) => [k, 0])) as ManifestZoneSummary;
  for (const kind of Object.values(byFile)) counts[kind] += 1;
  return counts;
}

function usageSummary(usage: DesignSystemGraph["usage"]): ManifestUsageSummary[] {
  const byKind = new Map<UsageEdgeKind, { files: number; count: number }>();
  for (const edge of usage) {
    const entry = byKind.get(edge.kind) ?? { files: 0, count: 0 };
    entry.files += 1;
    entry.count += edge.count;
    byKind.set(edge.kind, entry);
  }
  return [...byKind.entries()]
    .map(([kind, value]) => ({ kind, files: value.files, count: value.count }))
    .sort((a, b) => compare(a.kind, b.kind));
}

/** Project the internal graph onto the published contract. Pure, no I/O; `version`
 *  is injected rather than imported from the barrel to keep this module cycle-free. */
export function buildManifest(
  graph: DesignSystemGraph,
  opts: { version: string },
): DsManifest {
  return {
    schemaVersion: 1,
    generator: { name: "lyse", version: opts.version },
    tokenSetHash: computeGraphHash(graph),
    tokens: graph.tokens
      .map((t) => ({ id: t.id, axis: t.axis, value: t.rawValue, source: t.source }))
      .sort((a, b) => compare(a.id, b.id)),
    components: graph.components
      .map((c) => ({
        name: c.name,
        module: c.module,
        file: c.file,
        exportKind: c.exportKind,
        isDesignSystem: c.isDsComponent,
        detection: c.detection,
        usageCount: c.usageCount,
        props: c.props.map(toProp).sort((a, b) => compare(a.name, b.name)),
        storyCount: c.storyRefs.length,
      }))
      .sort((a, b) => compare(a.name, b.name)),
    zones: zoneSummary(graph.zones.byFile),
    usage: usageSummary(graph.usage),
    extraction: {
      entries: graph.extraction.entries.map((e) => ({
        extractor: e.extractor,
        status: e.status,
        evidence: e.evidence,
        remediation: e.remediation,
      })),
      conflicts: graph.extraction.conflicts.map((c) => ({
        axis: c.axis,
        value: c.value,
        tokenIds: c.tokenIds,
        sources: c.sources,
      })),
    },
  };
}
