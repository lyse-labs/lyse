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

export function classifyZone(rel: string, source: string, opts: ZoneInputs): ZoneKind {
  if (STORY_RE.test(rel)) return "story";
  if (isVendoredOrResetFile(rel)) return "vendored";
  if (isGeneratedCssSource(source)) return "generated";
  if (isPathExcluded(rel, opts.excludePaths)) return "config";
  if (isLowSignalValueFile(rel)) return "test";
  if (isSchemaOrDataFile(rel)) return "config";
  if (isColorTokenDefFile(rel)) return "ds-source";
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
