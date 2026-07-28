import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writePin, resolveJsMembers } from "./fetch-pins.js";

describe("writePin", () => {
  it("writes the snapshot file and returns a sha256 provenance record", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-fetch-"));
    const content = "$brand: #3b82f6;\n";
    const rec = writePin(dir, { name: "@x/tokens", version: "1.2.3" }, "dist/a.scss", content);
    expect(existsSync(join(dir, "dist/a.scss"))).toBe(true);
    expect(readFileSync(join(dir, "dist/a.scss"), "utf8")).toBe(content);
    expect(rec).toEqual({
      package: "@x/tokens",
      version: "1.2.3",
      path: "dist/a.scss",
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  });
});

describe("resolveJsMembers", () => {
  it("maps member->varname->colour, dropping non-colour and non-string exports", () => {
    const exports = {
      orange400: "--cnvs-base-palette-orange-400",
      space100: "--cnvs-base-space-100",
      notAString: 5,
    };
    const varMap = new Map<string, string[]>([
      ["--cnvs-base-palette-orange-400", ["oklch(0.7261 0.1852 52.58 / 1)"]],
      ["--cnvs-base-space-100", ["8px"]],
    ]);
    expect(resolveJsMembers("base", exports, varMap)).toEqual({
      "base.orange400": "oklch(0.7261 0.1852 52.58 / 1)",
    });
  });
});
