import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("VERSION", () => {
  it("matches the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
