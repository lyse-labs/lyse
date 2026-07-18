import type { ComponentPropEntry } from "../types.js";

export type ZoneKind =
  | "ds-source" | "app" | "story" | "test" | "generated" | "vendored" | "config";

export type TokenAxis =
  | "colors" | "spacing" | "typography" | "radii" | "shadows"
  | "motion" | "breakpoints" | "zIndex" | "opacity" | "borderWidth";

export type TokenSource =
  | "tailwind-v3" | "tailwind-v4" | "dtcg" | "css-custom-property"
  | "scss-variable" | "style-dictionary" | "tokens-studio" | "figma-variables";

export type ComponentDetection =
  | "module-config" | "convention" | "story-backref" | "ds-self";

export type UsageEdgeKind = "imports-ds-module";

export type ExtractionStatus = "ok" | "degraded" | "failed";

export interface TokenNode {
  id: string;
  axis: TokenAxis;
  rawValue: string;
  source: TokenSource;
}

export interface TokenConflict {
  axis: TokenAxis;
  value: string;
  tokenIds: string[];
  sources: TokenSource[];
}

export interface ComponentNode {
  name: string;
  file: string | null;
  module: string;
  exportKind: "named" | "default" | "unknown";
  usageCount: number;
  props: ComponentPropEntry[];
  isDsComponent: boolean;
  storyRefs: string[];
  detection: ComponentDetection;
}

export interface StoryNode {
  id: string;
  title: string;
  importPath: string;
  componentRef: string | null;
  hasArgTypes: boolean;
  hasArgs: boolean;
  storyExportCount: number;
}

export interface UsageEdgeAggregate {
  file: string;
  kind: UsageEdgeKind;
  count: number;
}

export interface ExtractionReportEntry {
  extractor: "tokens" | "components" | "stories" | "zones";
  status: ExtractionStatus;
  evidence: Record<string, number>;
  remediation: string | null;
}

export interface ExtractionReport {
  entries: ExtractionReportEntry[];
  conflicts: TokenConflict[];
}

export interface ZoneMap {
  byFile: Record<string, ZoneKind>;
}

export interface DesignSystemGraph {
  schemaVersion: 1;
  tokens: TokenNode[];
  components: ComponentNode[];
  stories: StoryNode[];
  usage: UsageEdgeAggregate[];
  zones: ZoneMap;
  extraction: ExtractionReport;
}
