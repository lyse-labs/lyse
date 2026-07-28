import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writePin } from "./fetch-pins.js";

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
