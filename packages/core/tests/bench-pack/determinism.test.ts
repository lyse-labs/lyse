import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { buildEvidencePack } from "../../src/bench/evidence-pack/builder.js";
import { serializeEvidencePack } from "../../src/commands/bench-pack.js";

const FIXTURE = join(__dirname, "..", "..", ".tmp", "determinism");

describe("EvidencePack determinism", () => {
  beforeAll(async () => {
    await rm(FIXTURE, { recursive: true, force: true });
    await mkdir(join(FIXTURE, "src"), { recursive: true });
    await writeFile(join(FIXTURE, "package.json"), '{"name":"a","version":"1.0.0","scripts":{"build":"tsc"}}');
    await writeFile(join(FIXTURE, "AGENTS.md"), "# Agents\n\n" + "- rule\n".repeat(20));
    await writeFile(join(FIXTURE, "src", "Box.tsx"), "export const Box = () => <div/>;");
    await writeFile(join(FIXTURE, "src", "Box.stories.tsx"), "export default {};");
    await writeFile(join(FIXTURE, "tsconfig.json"), "{}");
  });

  it("produces a byte-identical JSON for two consecutive runs on the same repo", async () => {
    const baseInput = {
      repoRoot: FIXTURE,
      owner: "o", name: "n", headSha: "deadbeef",
      lyseCliVersion: "0.1.0-test",
      extractedAt: "2026-05-26T00:00:00.000Z",
    };
    const a = await buildEvidencePack(baseInput);
    const b = await buildEvidencePack(baseInput);
    const jsonA = JSON.stringify(a);
    const jsonB = JSON.stringify(b);
    expect(jsonA).toBe(jsonB);
    const shaA = createHash("sha256").update(jsonA).digest("hex");
    const shaB = createHash("sha256").update(jsonB).digest("hex");
    expect(shaA).toBe(shaB);
  });

  it("serializes the pack with alphabetically sorted keys (deterministic JSON)", async () => {
    const pack = await buildEvidencePack({
      repoRoot: FIXTURE,
      owner: "o", name: "n", headSha: "deadbeef",
      lyseCliVersion: "0.1.0-test",
      extractedAt: "2026-05-26T00:00:00.000Z",
    });
    const out = serializeEvidencePack(pack);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());

    const collectUnsorted = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(collectUnsorted);
      if (value && typeof value === "object") {
        const keys = Object.keys(value as Record<string, unknown>);
        const bad = JSON.stringify(keys) !== JSON.stringify([...keys].sort()) ? keys : [];
        return [...bad, ...Object.values(value as Record<string, unknown>).flatMap(collectUnsorted)];
      }
      return [];
    };
    expect(collectUnsorted(parsed)).toEqual([]);
  });
});
