import { sortKeysDeep } from "../json-sort-keys.js";
import type { DsManifest } from "./types.js";

// This must point at the file's REAL path in the repo — packages/core/schemas/,
// not a root schemas/ (nothing relocates it there; see docs/architecture/manifest.md).
const MANIFEST_SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/packages/core/schemas/v1/lyse-manifest.json";

export function serializeManifest(manifest: DsManifest): string {
  const withSchema = { $schema: MANIFEST_SCHEMA_URL, ...manifest };
  return JSON.stringify(sortKeysDeep(withSchema), null, 2) + "\n";
}
