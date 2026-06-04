import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { persistCurrentVersion, readMigrationWarning } from "../version-migration.js";

describe("version-migration", () => {
  let tmp: string;
  let cacheFile: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "lyse-vmig-"));
    cacheFile = resolve(tmp, "last-version");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns warning=null on fresh install (no cache file)", () => {
    const r = readMigrationWarning({ currentVersion: "0.1.0", cacheFile });
    expect(r.warning).toBeNull();
    expect(r.previousVersion).toBeNull();
  });

  it("returns warning=null when previous == current (no upgrade)", () => {
    mkdirSync(resolve(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, "0.1.0");
    const r = readMigrationWarning({ currentVersion: "0.1.0", cacheFile });
    expect(r.warning).toBeNull();
    expect(r.previousVersion).toBe("0.1.0");
  });

  it("emits the alpha→0.1.0 warning when prior version is 0.1.0-alpha.*", () => {
    mkdirSync(resolve(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, "0.1.0-alpha.3");
    const r = readMigrationWarning({ currentVersion: "0.1.0", cacheFile });
    expect(r.warning).not.toBeNull();
    expect(r.warning).toContain("Welcome to Lyse v0.1.0");
    expect(r.warning).toContain("0.1.0-alpha.3");
    expect(r.warning).toContain("scoring-v1");
    expect(r.warning).toContain("not comparable");
    expect(r.warning).toContain("CHANGELOG");
    expect(r.previousVersion).toBe("0.1.0-alpha.3");
  });

  it("returns warning=null when upgrading 0.1.0 → some future version (no migration story yet)", () => {
    mkdirSync(resolve(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, "0.1.0");
    const r = readMigrationWarning({ currentVersion: "0.2.0", cacheFile });
    expect(r.warning).toBeNull();
    expect(r.previousVersion).toBe("0.1.0");
  });

  it("ignores an empty cache file", () => {
    mkdirSync(resolve(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, "");
    const r = readMigrationWarning({ currentVersion: "0.1.0", cacheFile });
    expect(r.warning).toBeNull();
    expect(r.previousVersion).toBeNull();
  });

  it("persistCurrentVersion writes the version atomically and is idempotent", () => {
    persistCurrentVersion({ currentVersion: "0.1.0", cacheFile });
    expect(existsSync(cacheFile)).toBe(true);
    expect(readFileSync(cacheFile, "utf8")).toBe("0.1.0");
    persistCurrentVersion({ currentVersion: "0.1.0", cacheFile });
    expect(readFileSync(cacheFile, "utf8")).toBe("0.1.0");
  });

  it("readMigrationWarning trims trailing whitespace in the cache file", () => {
    mkdirSync(resolve(cacheFile, ".."), { recursive: true });
    writeFileSync(cacheFile, "0.1.0-alpha.2\n");
    const r = readMigrationWarning({ currentVersion: "0.1.0", cacheFile });
    expect(r.previousVersion).toBe("0.1.0-alpha.2");
    expect(r.warning).toContain("0.1.0-alpha.2");
  });
});
