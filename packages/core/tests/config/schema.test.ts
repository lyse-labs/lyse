import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { safeParseLyseConfig, parseLyseConfig, LyseConfigSchema, loadConfig, resolveConfigPath } from "../../src/config/schema.js";

describe("safeParseLyseConfig", () => {
  it("accepts an empty object (minimal valid config)", () => {
    const r = safeParseLyseConfig({});
    expect(r.ok).toBe(true);
  });

  it("accepts null/undefined as invalid", () => {
    expect(safeParseLyseConfig(null).ok).toBe(false);
    expect(safeParseLyseConfig(undefined).ok).toBe(false);
    expect(safeParseLyseConfig("string").ok).toBe(false);
    expect(safeParseLyseConfig(42).ok).toBe(false);
  });

  it("accepts a full valid config", () => {
    const r = safeParseLyseConfig({
      designSystem: {
        componentsModule: "@org/ui",
        excludePaths: ["packages/legacy/**"],
        elements: { Button: "Button" },
      },
      rules: {
        "tokens/no-hardcoded-color": { severity: "warning", tolerance: 5 },
        "stories/coverage": "off",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.designSystem?.componentsModule).toBe("@org/ui");
      expect(r.value.designSystem?.elements?.["Button"]).toBe("Button");
    }
  });

  it("accepts config with only designSystem, no rules", () => {
    const r = safeParseLyseConfig({ designSystem: { componentsModule: "@ds/ui" } });
    expect(r.ok).toBe(true);
  });

  it("accepts config with only rules, no designSystem", () => {
    const r = safeParseLyseConfig({
      rules: { "tokens/no-hardcoded-color": "off" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects invalid types — componentsModule must be string", () => {
    const r = safeParseLyseConfig({ designSystem: { componentsModule: 42 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("componentsModule");
  });

  it("rejects invalid types — excludePaths must be string[]", () => {
    const r = safeParseLyseConfig({ designSystem: { excludePaths: [1, 2] } });
    expect(r.ok).toBe(false);
  });

  it("rejects bad rule severity enum value", () => {
    const r = safeParseLyseConfig({ rules: { "tokens/no-hardcoded-color": { severity: "fatal" } } });
    expect(r.ok).toBe(false);
    // Error path includes the rule key; just verify the result is a failure.
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it("rejects a rule value that is neither 'off' nor a config object", () => {
    const r = safeParseLyseConfig({ rules: { "my-rule": 123 } });
    expect(r.ok).toBe(false);
  });

  it("passes through unknown top-level keys (non-strict mode)", () => {
    // Zod strips unknown keys by default; does not error on them.
    const r = safeParseLyseConfig({ designSystem: {}, extraKey: "ignored" });
    expect(r.ok).toBe(true);
  });

  it("provides a readable error string on failure", () => {
    const r = safeParseLyseConfig({ designSystem: { componentsModule: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(typeof r.error).toBe("string");
      expect(r.error.length).toBeGreaterThan(0);
    }
  });
});

describe("safeParseLyseConfig — i18n block", () => {
  it("parses a full i18n block", () => {
    const r = safeParseLyseConfig({
      i18n: {
        locales: ["en", "fr"],
        vocabulary: {
          aiNouns: ["xai"],
          disclaimerPhrases: ["custom disclaimer"],
          controlLabels: ["try again"],
          gatePhrases: ["should we ship ai"],
          loadingPhrases: ["crunching"],
        },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.i18n?.locales).toEqual(["en", "fr"]);
      expect(r.value.i18n?.vocabulary?.aiNouns).toEqual(["xai"]);
    }
  });

  it("absent i18n block parses as undefined", () => {
    const r = safeParseLyseConfig({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.i18n).toBeUndefined();
  });

  it("accepts a partial i18n block (locales only)", () => {
    const r = safeParseLyseConfig({ i18n: { locales: ["ja"] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.i18n?.locales).toEqual(["ja"]);
      expect(r.value.i18n?.vocabulary).toBeUndefined();
    }
  });

  it("accepts a partial vocabulary (one domain only)", () => {
    const r = safeParseLyseConfig({
      i18n: { vocabulary: { aiNouns: ["xai"] } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.i18n?.vocabulary?.aiNouns).toEqual(["xai"]);
  });

  it("treats YAML `i18n:` with no value (null) as not set", () => {
    const r = safeParseLyseConfig({ i18n: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.i18n).toBeUndefined();
  });

  it("rejects non-string locales", () => {
    const r = safeParseLyseConfig({ i18n: { locales: [1, 2] } });
    expect(r.ok).toBe(false);
  });

  it("rejects non-array vocabulary domain values", () => {
    const r = safeParseLyseConfig({
      i18n: { vocabulary: { aiNouns: "xai" } },
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseLyseConfig", () => {
  it("returns validated object on valid input", () => {
    const v = parseLyseConfig({ designSystem: { componentsModule: "@ui/kit" } });
    expect(v.designSystem?.componentsModule).toBe("@ui/kit");
  });

  it("throws ZodError on invalid input", () => {
    expect(() => parseLyseConfig({ designSystem: { componentsModule: 99 } })).toThrow();
  });
});

describe("loadConfig integration — invalid .lyse.yaml", () => {
  let dir: string;
  const savedEnv = process.env.LYSE_CONFIG_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-config-"));
    delete process.env.LYSE_CONFIG_PATH;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.LYSE_CONFIG_PATH;
    } else {
      process.env.LYSE_CONFIG_PATH = savedEnv;
    }
  });

  it("returns empty config when .lyse.yaml is missing", () => {
    const config = loadConfig(dir);
    expect(config).toEqual({});
  });

  it("returns valid config for a well-formed .lyse.yaml", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: \"@ds/ui\"\n");
    const config = loadConfig(dir);
    expect(config.designSystem?.componentsModule).toBe("@ds/ui");
  });

  it("throws with a clear message when .lyse.yaml fails validation", () => {
    // componentsModule must be a string, not a number
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: 999\n");
    expect(() => loadConfig(dir)).toThrowError(/Invalid \.lyse\.yaml/);
  });

  it("respects LYSE_CONFIG_PATH env var to override discovery", () => {
    const altPath = join(dir, "custom-config.yaml");
    writeFileSync(altPath, "designSystem:\n  componentsModule: \"@custom/ui\"\n");
    process.env.LYSE_CONFIG_PATH = altPath;
    const config = loadConfig(dir);
    expect(config.designSystem?.componentsModule).toBe("@custom/ui");
  });
});

describe("loadConfig — degrade mode", () => {
  let dir: string;
  const savedEnv = process.env.LYSE_CONFIG_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-config-degrade-"));
    delete process.env.LYSE_CONFIG_PATH;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedEnv === undefined) {
      delete process.env.LYSE_CONFIG_PATH;
    } else {
      process.env.LYSE_CONFIG_PATH = savedEnv;
    }
  });

  it("returns empty config when .lyse.yaml is missing (degrade)", () => {
    const config = loadConfig(dir, { onError: "degrade" });
    expect(config).toEqual({});
  });

  it("returns valid config for a well-formed .lyse.yaml (degrade)", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: \"@ds/ui\"\n");
    const config = loadConfig(dir, { onError: "degrade" });
    expect(config.designSystem?.componentsModule).toBe("@ds/ui");
  });

  it("returns empty config instead of throwing when .lyse.yaml fails validation (degrade)", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: 999\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const config = loadConfig(dir, { onError: "degrade" });
    expect(config).toEqual({});
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[lyse] Warning: Invalid .lyse.yaml"));
  });

  it("logs to stderr (not throws) on invalid YAML in degrade mode", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: 999\n");
    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((msg) => {
      stderrLines.push(String(msg));
      return true;
    });
    expect(() => loadConfig(dir, { onError: "degrade" })).not.toThrow();
    expect(stderrLines.some((l) => l.includes("[lyse] Warning"))).toBe(true);
  });

  it("respects LYSE_CONFIG_PATH env var in degrade mode", () => {
    const altPath = join(dir, "custom-config.yaml");
    writeFileSync(altPath, "designSystem:\n  componentsModule: \"@custom/ui\"\n");
    process.env.LYSE_CONFIG_PATH = altPath;
    const config = loadConfig(dir, { onError: "degrade" });
    expect(config.designSystem?.componentsModule).toBe("@custom/ui");
  });
});

describe("loadConfig — throw mode (default)", () => {
  let dir: string;
  const savedEnv = process.env.LYSE_CONFIG_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lyse-config-throw-"));
    delete process.env.LYSE_CONFIG_PATH;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.LYSE_CONFIG_PATH;
    } else {
      process.env.LYSE_CONFIG_PATH = savedEnv;
    }
  });

  it("throws with explicit { onError: 'throw' } on invalid .lyse.yaml", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: 999\n");
    expect(() => loadConfig(dir, { onError: "throw" })).toThrowError(/Invalid \.lyse\.yaml/);
  });

  it("defaults to throw when opts is omitted", () => {
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: 999\n");
    expect(() => loadConfig(dir)).toThrowError(/Invalid \.lyse\.yaml/);
  });
});

describe("resolveConfigPath", () => {
  let tmp: string;
  const savedEnv = process.env.LYSE_CONFIG_PATH;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "lyse-resolve-"));
    delete process.env.LYSE_CONFIG_PATH;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.LYSE_CONFIG_PATH;
    else process.env.LYSE_CONFIG_PATH = savedEnv;
  });

  it("returns null when no .lyse.yaml exists in the repo root", () => {
    expect(resolveConfigPath(tmp)).toBeNull();
  });

  it("returns the absolute path to .lyse.yaml when it exists", () => {
    const path = join(tmp, ".lyse.yaml");
    writeFileSync(path, "llm: {}\n");
    expect(resolveConfigPath(tmp)).toBe(path);
  });

  it("respects the LYSE_CONFIG_PATH env var when set and the file exists", () => {
    const path = join(tmp, "custom.yaml");
    writeFileSync(path, "llm: {}\n");
    process.env.LYSE_CONFIG_PATH = path;
    expect(resolveConfigPath(tmp)).toBe(path);
  });

  it("returns null when LYSE_CONFIG_PATH is set but the file does not exist", () => {
    process.env.LYSE_CONFIG_PATH = join(tmp, "missing.yaml");
    expect(resolveConfigPath(tmp)).toBeNull();
  });
});

describe("LyseConfigSchema type inference", () => {
  it("schema produces inferred type compatible with LyseConfig", () => {
    // Compile-time check: the inferred type has the expected shape.
    // If this test file compiles, the type is compatible.
    const _: import("../../src/config/schema.js").LyseConfigValidated = {
      designSystem: {
        componentsModule: "@ds/ui",
        excludePaths: ["**/node_modules/**"],
        elements: {},
      },
      rules: {
        "tokens/no-hardcoded-color": "off",
        "stories/coverage": { severity: "warning" },
      },
    };
    expect(true).toBe(true); // existence of assignment above is the real check
  });
});
