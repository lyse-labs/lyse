import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-manifest-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "tokens.tokens.json"),
    JSON.stringify({ color: { brand: { $type: "color", $value: "#3b82f6" } } }),
  );
  return dir;
}

describe("lyse manifest", () => {
  it("prints a schemaVersion 1 manifest carrying the extraction contract", () => {
    const out = execFileSync("node", [cli, "manifest", fixture()], { encoding: "utf8" });
    const m = JSON.parse(out) as Record<string, unknown>;
    expect(m["schemaVersion"]).toBe(1);
    expect(m["generator"]).toMatchObject({ name: "lyse" });
    expect(typeof m["tokenSetHash"]).toBe("string");
    expect(m["extraction"]).toBeDefined();
    expect(m["zones"]).toBeDefined();
  });

  it("is byte-identical across two runs (determinism)", () => {
    const dir = fixture();
    const a = execFileSync("node", [cli, "manifest", dir], { encoding: "utf8" });
    const b = execFileSync("node", [cli, "manifest", dir], { encoding: "utf8" });
    expect(a).toBe(b);
  });

  it("writes to --output when given", () => {
    const dir = fixture();
    const out = join(dir, "manifest.json");
    execFileSync("node", [cli, "manifest", dir, "--output", out], { encoding: "utf8" });
    expect(JSON.parse(readFileSync(out, "utf8"))).toMatchObject({ schemaVersion: 1 });
  });
});
