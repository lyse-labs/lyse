import type {
  ComponentDetection,
  ExtractionStatus,
  TokenAxis,
  TokenSource,
  UsageEdgeKind,
  ZoneKind,
} from "../graph/types.js";

export interface ManifestToken {
  id: string;
  axis: TokenAxis;
  value: string;
  source: TokenSource;
}

export interface ManifestProp {
  name: string;
  type: string | null;
  optional: boolean;
  default: string | null;
  variants: string[] | null;
}

export interface ManifestComponent {
  name: string;
  module: string;
  file: string | null;
  exportKind: "named" | "default" | "unknown";
  isDesignSystem: boolean;
  detection: ComponentDetection;
  usageCount: number;
  props: ManifestProp[];
  storyCount: number;
}

export type ManifestZoneSummary = Record<ZoneKind, number>;

export interface ManifestUsageSummary {
  kind: UsageEdgeKind;
  files: number;
  count: number;
}

export interface ManifestExtractionEntry {
  extractor: "tokens" | "components" | "stories" | "zones";
  status: ExtractionStatus;
  evidence: Record<string, number>;
  remediation: string | null;
}

export interface ManifestTokenConflict {
  axis: TokenAxis;
  value: string;
  tokenIds: string[];
  sources: TokenSource[];
}

export interface ManifestExtraction {
  entries: ManifestExtractionEntry[];
  conflicts: ManifestTokenConflict[];
}

/** The published DS Machine Manifest — a STABLE projection of the internal
 *  DesignSystemGraph. The graph is an implementation detail free to change;
 *  this contract changes only under SemVer (docs/architecture/manifest.md). */
export interface DsManifest {
  schemaVersion: 1;
  generator: { name: "lyse"; version: string };
  tokenSetHash: string;
  tokens: ManifestToken[];
  components: ManifestComponent[];
  zones: ManifestZoneSummary;
  usage: ManifestUsageSummary[];
  extraction: ManifestExtraction;
}
