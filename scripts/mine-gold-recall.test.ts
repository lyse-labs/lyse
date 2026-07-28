import { describe, it, expect } from "vitest";
import { parseGoldCorpusYaml } from "./mine-gold-recall.js";

describe("parseGoldCorpusYaml tokenPackage", () => {
  it("parses an optional tokenPackage", () => {
    const yaml = `entries:\n  - repo: r\n    url: u\n    sha: s\n    parent: p\n    tokenPackage:\n      name: "@x/tokens"\n      version: "1.2.3"\n      files: ["dist/a.css"]\n`;
    expect(parseGoldCorpusYaml(yaml)[0]?.tokenPackage).toEqual({
      name: "@x/tokens", version: "1.2.3", files: ["dist/a.css"],
    });
  });
  it("keeps entries without a tokenPackage (undefined)", () => {
    const yaml = `entries:\n  - repo: r\n    url: u\n    sha: s\n    parent: p\n`;
    const e = parseGoldCorpusYaml(yaml)[0];
    expect(e?.repo).toBe("r");
    expect(e?.tokenPackage).toBeUndefined();
  });
  it("drops the whole entry when tokenPackage is malformed", () => {
    const yaml = `entries:\n  - repo: r\n    url: u\n    sha: s\n    parent: p\n    tokenPackage:\n      name: "@x"\n`; // missing version+files
    expect(parseGoldCorpusYaml(yaml)).toEqual([]);
  });
  it("parses a tokenPackage with a js block", () => {
    const yaml = `entries:\n  - repo: r\n    url: u\n    sha: s\n    parent: p\n    tokenPackage:\n      name: "@x/tokens"\n      version: "1.0.0"\n      files: ["t.json"]\n      js:\n        modules:\n          base: "dist/es6/base/index.js"\n        cssVars: ["css/base/_variables.css"]\n`;
    expect(parseGoldCorpusYaml(yaml)[0]?.tokenPackage).toEqual({
      name: "@x/tokens",
      version: "1.0.0",
      files: ["t.json"],
      js: { modules: { base: "dist/es6/base/index.js" }, cssVars: ["css/base/_variables.css"] },
    });
  });
  it("drops the entry when the js block is malformed", () => {
    const yaml = `entries:\n  - repo: r\n    url: u\n    sha: s\n    parent: p\n    tokenPackage:\n      name: "@x/tokens"\n      version: "1.0.0"\n      files: ["t.json"]\n      js:\n        modules: {}\n        cssVars: ["c.css"]\n`; // empty modules -> malformed
    expect(parseGoldCorpusYaml(yaml)).toEqual([]);
  });
});
