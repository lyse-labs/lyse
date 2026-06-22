import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../../validation/temp-repo.js";

describe("withTempRepo", () => {
  it("writes nested files, exposes the dir, and cleans up after", async () => {
    let captured = "";
    const seen = await withTempRepo(
      { "src/a/b.css": ".x { color: red; }", "package.json": "{}" },
      async (dir) => {
        captured = dir;
        expect(existsSync(join(dir, "package.json"))).toBe(true);
        return readFileSync(join(dir, "src/a/b.css"), "utf8");
      },
    );
    expect(seen).toBe(".x { color: red; }");
    expect(existsSync(captured)).toBe(false); // cleaned up
  });
});
