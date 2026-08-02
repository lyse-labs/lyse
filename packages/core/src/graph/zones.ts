import {
  isVendoredOrResetFile,
  isGeneratedCssSource,
  isLowSignalValueFile,
  isSchemaOrDataFile,
  isColorTokenDefFile,
} from "../rules/_skip-context.js";
import { isPathExcluded } from "../rules/_exclude.js";
import type { ZoneKind, ZoneMap } from "./types.js";
import type { ParsedFiles } from "../types.js";

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

/**
 * Drop every parsed file whose zone is in `kinds`, before the rules engine sees
 * it. Filtering findings after the fact would be wrong: `PerRuleOpportunity`
 * carries no file attribution, so removing a finding without its opportunity
 * inflates the clean rate. Removing the file removes both sides together.
 *
 * Measured on two held-out repositories, 19% of findings landed in files this
 * classifier had already labelled `test` — and on primer-react the largest
 * score-contributing penalty group, `components/svg-viewbox` x17, was 15/17
 * inside test files, flagging `vi.fn(() => <svg aria-hidden="true" />)` mocks.
 */
export function excludeZones(
  parsed: ParsedFiles,
  zones: ZoneMap,
  kinds: ReadonlySet<ZoneKind>,
): ParsedFiles {
  const keep = (path: string): boolean => {
    const zone = zones.byFile[path];
    return zone === undefined || !kinds.has(zone);
  };
  return {
    ts: parsed.ts.filter((f) => keep(f.path)),
    css: parsed.css.filter((f) => keep(f.path)),
    cssInJs: parsed.cssInJs.filter((f) => keep(f.path)),
  };
}
