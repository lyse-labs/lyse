import { describe, it, expect } from "vitest";
import { fixShadowNative } from "../../src/codemods/shadow-native.js";
import type { Finding, RuleContext } from "../../src/types.js";

const ctx = (componentsModule: string | null): RuleContext => ({
  repoRoot: "/r",
  tokens: null,
  componentsModule,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
});

const findingShadow = (line: number, tag: string): Finding => ({
  ruleId: "components/no-native-shadows",
  axis: "components",
  severity: "warning",
  location: { file: "x.tsx", line, column: 1 },
  message: `Native <${tag}> used where <DS> from @acme/ui is available`,
});

describe("fixShadowNative", () => {
  it("replaces <button> with <Button> and injects import when not present", () => {
    const source = `import React from "react";\nexport const X = () => <button>click</button>;`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(2, "button"),
      ctx: ctx("@acme/ui"),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain(`import { Button } from "@acme/ui"`);
    expect(r.patch).toContain("<Button");
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.rule_id).toBe("components/no-native-shadows");
    expect(r.schema_version).toBe("1.0.0");
  });

  it("only replaces the tag (no import injection) when Button is already imported", () => {
    const source = `import { Button } from "@acme/ui";\nexport const X = () => <button>click</button>;`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(2, "button"),
      ctx: ctx("@acme/ui"),
    });
    expect(r.patch).not.toBeNull();
    // Should NOT inject an import — count occurrences of "import { Button"
    const importCount = (r.patch!.match(/\+import \{ Button \}/g) || []).length;
    expect(importCount).toBe(0);
    expect(r.patch).toContain("<Button");
  });

  it("returns patch:null when no componentsModule configured", () => {
    const source = `<button />`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(1, "button"),
      ctx: ctx(null),
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("No componentsModule");
  });

  it("lowers confidence when closing tag is on a different line", () => {
    const source = `<button>\n  click\n</button>`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(1, "button"),
      ctx: ctx("@acme/ui"),
    });
    expect(r.patch).not.toBeNull();
    expect(r.confidence).toBeLessThan(0.7);
    expect(r.rationale).toContain("not on the same line");
  });

  it("handles <a> → <Link> replacement", () => {
    const source = `import { Link } from "@acme/ui";\nexport const X = () => <a href="/about">About</a>;`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(2, "a"),
      ctx: ctx("@acme/ui"),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("<Link");
  });

  it("handles <input> → <Input> replacement", () => {
    const source = `import React from "react";\nexport const X = () => <input type="text" />;`;
    const r = fixShadowNative({
      source,
      path: "x.tsx",
      finding: findingShadow(2, "input"),
      ctx: ctx("@acme/ui"),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain(`import { Input } from "@acme/ui"`);
    expect(r.patch).toContain("<Input");
  });

  it("returns patch:null when native tag cannot be parsed from message", () => {
    const source = `<button />`;
    const finding: Finding = {
      ruleId: "components/no-native-shadows",
      axis: "components",
      severity: "warning",
      location: { file: "x.tsx", line: 1, column: 1 },
      message: "something completely different with no native tag marker",
    };
    const r = fixShadowNative({ source, path: "x.tsx", finding, ctx: ctx("@acme/ui") });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("Could not parse native tag");
  });
});
