import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface SubDimension {
  id: string;
  weight: number;
  scope?: ReadonlyArray<string>;
}

export interface Axis {
  id: string;
  title: string;
  weight: number;
  subDimensions: ReadonlyArray<SubDimension>;
}

export interface Taxonomy {
  schemaVersion: "taxonomy/3.0";
  validUntil: string;
  lastReview: string;
  rotationKeyHash: string;
  axes: ReadonlyArray<Axis>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_PATH = join(HERE, "taxonomy.v3.json");

export function validateTaxonomy(input: unknown): asserts input is Taxonomy {
  if (!input || typeof input !== "object") {
    throw new Error("taxonomy: input must be an object");
  }
  const t = input as Taxonomy;
  if (t.schemaVersion !== "taxonomy/3.0") {
    throw new Error(`taxonomy: unexpected schemaVersion ${String(t.schemaVersion)}`);
  }
  if (!Array.isArray(t.axes) || t.axes.length === 0) {
    throw new Error("taxonomy: axes must be a non-empty array");
  }
  const totalWeight = t.axes.reduce((acc, a) => acc + a.weight, 0);
  if (totalWeight !== 100) {
    throw new Error(`taxonomy: axis weights must sum to 100, got ${totalWeight}`);
  }
}

export async function loadTaxonomy(): Promise<Taxonomy> {
  const raw = await readFile(TAXONOMY_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  validateTaxonomy(parsed);
  return parsed;
}
