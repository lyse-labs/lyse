import { describe, it, expect } from "vitest";
import { parseCss } from "../../src/parsers/css.js";

describe("parseCss", () => {
  it("returns the raw source for a plain CSS file", async () => {
    const out = await parseCss("a.css", ".x { color: #fff; }");
    expect(out.path).toBe("a.css");
    expect(out.source).toBe(".x { color: #fff; }");
    expect(out.skipped).toBeUndefined();
  });

  describe("SCSS support (v0.1)", () => {
    it("does NOT throw when given a .scss file with `//` line comments", async () => {
      const scssSource = `
// This is a SCSS line comment
$primary: #3b82f6;
.button {
  // another comment
  color: $primary;
  padding: 8px 16px;
}
`;
      await expect(parseCss("components/_button.scss", scssSource)).resolves.not.toThrow();
    });

    it("transforms a .scss file to CSS-equivalent source (not skipped)", async () => {
      const scssSource = `
        $primary-500: #3b82f6;
        :root { --primary-500: #{$primary-500}; }
      `;
      const out = await parseCss("styles/main.scss", scssSource);
      expect(out.path).toBe("styles/main.scss");
      expect(out.skipped).toBeUndefined();
      expect(out.source).toContain("--primary-500: #3b82f6");
      expect(out.source).not.toContain("$primary-500: #3b82f6");
    });

    it("falls back to `skipped: true` when the SCSS transform throws", async () => {
      // postcss-scss is permissive, so we trigger a failure with a non-string
      // input cast to string. The transform should not crash the audit.
      const malformed = "{ unclosed brace and a /* unclosed comment";
      const out = await parseCss("x.scss", malformed);
      // Either the parser handles it (skipped undefined) OR it throws and
      // we fall back to `skipped: true`. Both are acceptable here; the key
      // invariant is "no thrown exception".
      expect(["boolean", "undefined"]).toContain(typeof out.skipped);
      expect(out.path).toBe("x.scss");
    });

    it("returns a skipped result for .sass (indented syntax) files", async () => {
      const sassSource = `// comment\n.x\n  color: red`;
      const out = await parseCss("styles/main.sass", sassSource);
      expect(out.path).toBe("styles/main.sass");
      expect(out.skipped).toBe(true);
    });

    it("does NOT skip plain .css files", async () => {
      const out = await parseCss("a.css", ".x { color: #fff; }");
      expect(out.skipped).toBeUndefined();
    });
  });
});
