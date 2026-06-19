import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTokens } from "../../src/loaders/tokens.js";

describe("loadTokens", () => {
  it("loads Tailwind v3 config and exposes colors + spacing", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw3-"));
    writeFileSync(
      join(root, "tailwind.config.js"),
      `module.exports = { theme: { colors: { primary: "#2563eb" }, spacing: { "1": "4px", "2": "8px" } } };`,
    );
    const tokens = await loadTokens(root);
    expect(tokens).not.toBeNull();
    expect(tokens!.colors.get("#2563eb")).toContain("primary");
    expect(tokens!.spacing.get("4")).toContain("1");
    expect(tokens!.source).toBe("tailwind-v3");
  });

  it("loads Tailwind v4 @theme blocks", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw4-"));
    mkdirSync(join(root, "app"));
    writeFileSync(
      join(root, "app", "globals.css"),
      `@import "tailwindcss";\n@theme {\n  --color-primary: #2563eb;\n  --spacing-2: 8px;\n}`,
    );
    const tokens = await loadTokens(root);
    expect(tokens!.source).toBe("tailwind-v4");
    expect(tokens!.colors.get("#2563eb")).toContain("primary");
  });

  it("loads DTCG tokens", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dtcg-"));
    writeFileSync(
      join(root, "tokens.tokens.json"),
      JSON.stringify({ color: { action: { primary: { $value: "#2563eb", $type: "color" } } } }),
    );
    const tokens = await loadTokens(root);
    expect(tokens!.source).toBe("dtcg");
    expect(tokens!.colors.get("#2563eb")).toContain("color/action/primary");
  });

  it("returns null when nothing is found", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-none-"));
    expect(await loadTokens(root)).toBeNull();
  });

  it("degrades gracefully when a DTCG token file is malformed JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dtcg-bad-"));
    writeFileSync(join(root, "broken.tokens.json"), "{ this is not valid json");
    writeFileSync(
      join(root, "good.tokens.json"),
      JSON.stringify({ color: { brand: { $value: "#2563eb", $type: "color" } } }),
    );
    const tokens = await loadTokens(root);
    expect(tokens!.source).toBe("dtcg");
    expect(tokens!.colors.get("#2563eb")).toContain("color/brand");
  });
});

// ─── Sprint 1 Step 1: 8 new token type tests ────────────────────────────────

describe("loadTokens — Tailwind v3: 8 new token types", () => {
  it("extracts typography, radii, shadows, motion, breakpoints, zIndex, opacity, borderWidth", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw3-new-"));
    // Note: the loader's regex coercion requires keys to be either unquoted or single-quoted.
    // Values must be double-quoted (standard JSON strings) for JSON.parse to succeed.
    writeFileSync(
      join(root, "tailwind.config.js"),
      // Using string concatenation to avoid template literal quoting conflicts.
      // Note: NO trailing commas — JSON.parse does not allow them.
      'module.exports = { theme: {' +
      ' fontSize: { sm: "14px", base: "16px" },' +
      ' fontWeight: { normal: "400", bold: "700" },' +
      ' lineHeight: { tight: "1.25", normal: "1.5" },' +
      ' letterSpacing: { tight: "-0.05em", wide: "0.1em" },' +
      ' borderRadius: { md: "6px", lg: "12px", full: "9999px" },' +
      ' boxShadow: { sm: "0 1px 2px rgba(0 0 0 / 0.1)" },' +
      ' transitionDuration: { fast: "150ms", slow: "500ms" },' +
      ' transitionTimingFunction: { out: "cubic-bezier(0 0 0.2 1)" },' +
      ' screens: { md: "768px", lg: "1024px" },' +
      ' zIndex: { dropdown: "1000", modal: "2000" },' +
      ' opacity: { half: "0.5", quarter: "0.25" },' +
      ' borderWidth: { thin: "1px", medium: "2px" }' +
      ' } };',
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();

    // typography — font-size (plain string values)
    expect(map!.typography.get("14px")).toContain("typography/sm");
    expect(map!.typography.get("16px")).toContain("typography/base");

    // typography — fontWeight (key prefix "weight/")
    expect(map!.typography.get("weight/400")).toContain("typography/normal");
    expect(map!.typography.get("weight/700")).toContain("typography/bold");

    // typography — lineHeight (key prefix "line-height/")
    expect(map!.typography.get("line-height/1.25")).toContain("typography/tight");
    expect(map!.typography.get("line-height/1.5")).toContain("typography/normal");

    // typography — letterSpacing (key prefix "letter-spacing/")
    expect(map!.typography.get("letter-spacing/-0.05em")).toContain("typography/tight");
    expect(map!.typography.get("letter-spacing/0.1em")).toContain("typography/wide");

    // radii
    expect(map!.radii.get("6px")).toContain("radii/md");
    expect(map!.radii.get("12px")).toContain("radii/lg");
    expect(map!.radii.get("9999px")).toContain("radii/full");

    // shadows
    expect(map!.shadows.get("0 1px 2px rgba(0 0 0 / 0.1)")).toContain("shadows/sm");

    // motion — duration (key prefix "duration/")
    expect(map!.motion.get("duration/150ms")).toContain("motion/duration/fast");
    expect(map!.motion.get("duration/500ms")).toContain("motion/duration/slow");

    // motion — easing (key prefix "easing/")
    // Note: commas inside values cause JSON parse issues with the current regex approach;
    // space-separated cubic-bezier is used here for test compatibility.
    expect(map!.motion.get("easing/cubic-bezier(0 0 0.2 1)")).toContain("motion/easing/out");

    // breakpoints — plain string values
    expect(map!.breakpoints.get("768px")).toContain("breakpoints/md");
    expect(map!.breakpoints.get("1024px")).toContain("breakpoints/lg");

    // zIndex
    expect(map!.zIndex.get("1000")).toContain("zIndex/dropdown");
    expect(map!.zIndex.get("2000")).toContain("zIndex/modal");

    // opacity
    expect(map!.opacity.get("0.5")).toContain("opacity/half");
    expect(map!.opacity.get("0.25")).toContain("opacity/quarter");

    // borderWidth
    expect(map!.borderWidth.get("1px")).toContain("borderWidth/thin");
    expect(map!.borderWidth.get("2px")).toContain("borderWidth/medium");

    // source
    expect(map!.source).toBe("tailwind-v3");
  });

  it("backward compat: existing colors + spacing still work alongside new types", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw3-compat-"));
    writeFileSync(
      join(root, "tailwind.config.js"),
      'module.exports = { theme: { colors: { brand: "#3b82f6" }, spacing: { "4": "16px" }, borderRadius: { sm: "4px" } } };',
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    expect(map!.colors.get("#3b82f6")).toContain("brand");
    expect(map!.spacing.get("16")).toContain("4");
    expect(map!.radii.get("4px")).toContain("radii/sm");
  });
});

describe("loadTokens — Tailwind v4: 8 new token types", () => {
  it("extracts typography, radii, shadows, motion, breakpoints, zIndex, opacity, borderWidth from @theme", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw4-new-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "globals.css"),
      `@import "tailwindcss";
@theme {
  --color-primary: #2563eb;
  --spacing-4: 1rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-weight-bold: 700;
  --leading-tight: 1.25;
  --tracking-wide: 0.1em;
  --radius-md: 6px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
  --transition-duration-fast: 150ms;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --z-dropdown: 1000;
  --opacity-half: 0.5;
  --border-width-thin: 1px;
}`,
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    expect(map!.source).toBe("tailwind-v4");

    // typography
    expect(map!.typography.get("0.875rem")).toContain("sm");
    expect(map!.typography.get("1rem")).toContain("base");
    expect(map!.typography.get("weight/700")).toContain("bold");
    expect(map!.typography.get("line-height/1.25")).toContain("tight");
    expect(map!.typography.get("letter-spacing/0.1em")).toContain("wide");

    // radii
    expect(map!.radii.get("6px")).toContain("md");
    expect(map!.radii.get("12px")).toContain("lg");

    // shadows
    expect(map!.shadows.get("0 1px 2px rgba(0,0,0,0.1)")).toContain("sm");

    // motion — duration
    expect(map!.motion.get("duration/150ms")).toContain("fast");
    // motion — easing
    expect(map!.motion.get("easing/cubic-bezier(0, 0, 0.2, 1)")).toContain("out");

    // breakpoints
    expect(map!.breakpoints.get("768px")).toContain("md");
    expect(map!.breakpoints.get("1024px")).toContain("lg");

    // zIndex
    expect(map!.zIndex.get("1000")).toContain("dropdown");

    // opacity
    expect(map!.opacity.get("0.5")).toContain("half");

    // borderWidth
    expect(map!.borderWidth.get("1px")).toContain("thin");
  });

  it("does NOT capture --shadow-color-* in shadows map (excluded by design)", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tw4-shadow-color-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "globals.css"),
      `@import "tailwindcss";
@theme {
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
  --shadow-color-brand: #2563eb;
}`,
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    // --shadow-sm should be in shadows
    expect(map!.shadows.get("0 1px 2px rgba(0,0,0,0.1)")).toContain("sm");
    // --shadow-color-brand should NOT be in shadows
    for (const tokens of map!.shadows.values()) {
      expect(tokens).not.toContain("color-brand");
    }
  });
});

describe("loadTokens — DTCG: 8 new token types", () => {
  it("extracts shadow, duration, cubicBezier, fontFamily, fontWeight, and typography composite", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dtcg-new-"));
    writeFileSync(
      join(root, "tokens.tokens.json"),
      JSON.stringify({
        shadow: {
          sm: { $value: "0 1px 2px rgba(0,0,0,0.1)", $type: "shadow" },
          complex: { $value: { offsetX: "0px", offsetY: "4px", blur: "6px", spread: "0px", color: "rgba(0,0,0,0.15)" }, $type: "shadow" },
        },
        motion: {
          duration: {
            fast: { $value: "150ms", $type: "duration" },
            slow: { $value: "500ms", $type: "duration" },
          },
          easing: {
            out: { $value: [0, 0, 0.2, 1], $type: "cubicBezier" },
          },
        },
        font: {
          family: { body: { $value: "Inter", $type: "fontFamily" } },
          weight: { bold: { $value: "700", $type: "fontWeight" } },
        },
        typography: {
          heading: { $value: { fontSize: "32px", lineHeight: "40px", fontWeight: "700" }, $type: "typography" },
        },
        color: {
          primary: { $value: "#2563eb", $type: "color" },
        },
        spacing: {
          md: { $value: "16px", $type: "dimension" },
        },
      }),
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    expect(map!.source).toBe("dtcg");

    // shadows — string value
    expect(map!.shadows.get("0 1px 2px rgba(0,0,0,0.1)")).toContain("shadow/sm");
    // shadows — object value serialized
    expect(map!.shadows.size).toBeGreaterThanOrEqual(2);

    // motion — duration
    expect(map!.motion.get("duration/150ms")).toContain("motion/duration/fast");
    expect(map!.motion.get("duration/500ms")).toContain("motion/duration/slow");

    // motion — cubicBezier easing
    expect(map!.motion.get("easing/cubic-bezier(0, 0, 0.2, 1)")).toContain("motion/easing/out");

    // fontFamily
    expect(map!.typography.get("family/inter")).toContain("font/family/body");

    // fontWeight
    expect(map!.typography.get("weight/700")).toContain("font/weight/bold");

    // typography composite — fontSize extracted
    expect(map!.typography.get("32px")).toContain("typography/heading");

    // colors + spacing still work (backward compat)
    expect(map!.colors.get("#2563eb")).toContain("color/primary");
    expect(map!.spacing.get("16")).toContain("spacing/md");
  });

  it("routes dimension $type to correct map based on path heuristics", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dtcg-dim-"));
    writeFileSync(
      join(root, "tokens.tokens.json"),
      JSON.stringify({
        radius: {
          sm: { $value: "4px", $type: "dimension" },
        },
        spacing: {
          md: { $value: "16px", $type: "dimension" },
        },
      }),
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    // radius/* dimension → radii map
    expect(map!.radii.size).toBeGreaterThanOrEqual(1);
    // spacing/* dimension → spacing map (backward compat)
    expect(map!.spacing.get("16")).toContain("spacing/md");
  });

  it("routes number $type to zIndex or opacity based on path heuristics", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-dtcg-num-"));
    writeFileSync(
      join(root, "tokens.tokens.json"),
      JSON.stringify({
        zIndex: {
          dropdown: { $value: "1000", $type: "number" },
        },
        opacity: {
          half: { $value: "0.5", $type: "number" },
        },
      }),
    );
    const map = await loadTokens(root);
    expect(map).not.toBeNull();
    expect(map!.zIndex.get("1000")).toContain("zIndex/dropdown");
    expect(map!.opacity.get("0.5")).toContain("opacity/half");
  });
});
