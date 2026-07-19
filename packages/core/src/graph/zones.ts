import {
  isVendoredOrResetFile,
  isGeneratedCssSource,
  isLowSignalValueFile,
  isSchemaOrDataFile,
  isColorTokenDefFile,
} from "../rules/_skip-context.js";
import { isPathExcluded } from "../rules/_exclude.js";
import type { ZoneKind, ZoneMap } from "./types.js";

export interface ZoneInputs {
  excludePaths: string[];
  dsSelfMode: boolean;
}

const STORY_RE = /\.stories\.[jt]sx?$/;

// P2: real-repo conventions the JS/TS-only skip regexes miss.
const STORY_STYLING_RE = /(?:^|[\\/])[^\\/]*(?:[.-]story|[.-]stories)\.(?:css|scss|sass|less)$/i;
const FIGMA_RE = /(?:^|[\\/])code-connect[\\/]|\.figma\.[cm]?[jt]sx?$/i;
const HYPHEN_TEST_RE = /(?:^|[\\/])[^\\/]*-test\.[cm]?[jt]sx?$|(?:^|[\\/])test\.(?:css|scss|sass|less)$/i;
const PREVIEWER_RE = /(?:^|[\\/])previewer[\\/]/i;

// P2: a component registry is DS source (the DS's own components), not consumer app.
// Matches a `registry/` path segment and shadcn theme-variant `styles/<variant>/ui/` trees.
const REGISTRY_DS_SOURCE_RE = /(?:^|[\\/])registry[\\/]|(?:^|[\\/])styles[\\/][^\\/]+[\\/]ui[\\/]/i;

export function classifyZone(rel: string, source: string, opts: ZoneInputs): ZoneKind {
  if (STORY_RE.test(rel)) return "story";
  if (isVendoredOrResetFile(rel)) return "vendored";
  if (isGeneratedCssSource(source)) return "generated";
  if (isPathExcluded(rel, opts.excludePaths)) return "config";
  if (isLowSignalValueFile(rel)) return "test";
  if (isSchemaOrDataFile(rel)) return "config";
  if (isColorTokenDefFile(rel)) return "ds-source";
  if (STORY_STYLING_RE.test(rel)) return "story";
  if (PREVIEWER_RE.test(rel)) return "config";
  if (FIGMA_RE.test(rel)) return "config";
  if (HYPHEN_TEST_RE.test(rel)) return "test";
  if (REGISTRY_DS_SOURCE_RE.test(rel)) return "ds-source";
  return opts.dsSelfMode ? "ds-source" : "app";
}

export function buildZoneMap(
  files: Array<{ rel: string; source: string }>,
  opts: ZoneInputs,
): ZoneMap {
  const byFile: Record<string, ZoneKind> = {};
  for (const f of files) {
    byFile[f.rel] = classifyZone(f.rel, f.source, opts);
  }
  return { byFile };
}
