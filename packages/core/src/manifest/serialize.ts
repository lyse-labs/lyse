import { sortKeysDeep } from "../json-sort-keys.js";
import type { DsManifest } from "./types.js";

const MANIFEST_SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-manifest.json";

export function serializeManifest(manifest: DsManifest): string {
  const withSchema = { $schema: MANIFEST_SCHEMA_URL, ...manifest };
  return JSON.stringify(sortKeysDeep(withSchema), null, 2) + "\n";
}
