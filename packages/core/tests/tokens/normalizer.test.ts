import { describe, it, expect } from "vitest";
import { normalizeToDtcg } from "../../src/tokens/normalizer.js";
import { isDtcgToken, isDtcgGroup } from "../../src/tokens/dtcg-model.js";

describe("normalizeToDtcg — tailwind-v3", () => {
  it("converts colors, spacing, fontSize, shadow into DTCG groups", () => {
    const { document, warnings } = normalizeToDtcg({
      source: "tailwind-v3",
      data: {
        theme: {
          colors: { brand: "#2563eb", neutral: { "50": "#fafafa" } },
          spacing: { "1": "4px", "2": "8px" },
          fontSize: { base: "16px", lg: ["18px", { lineHeight: "28px" }] },
          boxShadow: { sm: "0 1px 2px rgba(0,0,0,0.05)" },
        },
      },
    });
    expect(warnings).toEqual([]);
    const color = document.color;
    expect(isDtcgGroup(color)).toBe(true);
    if (!isDtcgGroup(color)) throw new Error("expected group");
    expect(isDtcgToken(color.brand)).toBe(true);
    const brand = color.brand;
    if (!isDtcgToken(brand)) throw new Error("expected token");
    expect(brand.$value).toBe("#2563eb");
    expect(brand.$type).toBe("color");
    const neutral = color.neutral;
    if (!isDtcgGroup(neutral)) throw new Error("expected nested group");
    const n50 = neutral["50"];
    if (!isDtcgToken(n50)) throw new Error("expected token at neutral.50");
    expect(n50.$value).toBe("#fafafa");

    const spacing = document.spacing;
    if (!isDtcgGroup(spacing)) throw new Error("expected spacing group");
    const sp1 = spacing["1"];
    if (!isDtcgToken(sp1)) throw new Error("expected spacing.1 token");
    expect(sp1.$value).toBe("4px");
    expect(sp1.$type).toBe("dimension");

    const fontSize = document.fontSize;
    if (!isDtcgGroup(fontSize)) throw new Error("expected fontSize group");
    const lg = fontSize.lg;
    if (!isDtcgToken(lg)) throw new Error("expected fontSize.lg token");
    expect(lg.$value).toBe("18px");

    const shadow = document.shadow;
    if (!isDtcgGroup(shadow)) throw new Error("expected shadow group");
    const sm = shadow.sm;
    if (!isDtcgToken(sm)) throw new Error("expected shadow.sm token");
    expect(sm.$value).toBe("0 1px 2px rgba(0,0,0,0.05)");
    expect(sm.$type).toBe("shadow");
  });

  it("emits a warning when fontSize value cannot be inferred", () => {
    const { warnings } = normalizeToDtcg({
      source: "tailwind-v3",
      data: { theme: { fontSize: { weird: 42 as unknown as string } } },
    });
    expect(warnings.some((w) => w.includes("fontSize"))).toBe(true);
  });
});

describe("normalizeToDtcg — tailwind-v4", () => {
  it("converts utility-generating @theme decls", () => {
    const { document, warnings } = normalizeToDtcg({
      source: "tailwind-v4",
      data: new Map([
        ["--color-brand", "oklch(0.5 0.2 240)"],
        ["--spacing-md", "1rem"],
        ["--ease-snappy", "cubic-bezier(0.4, 0, 0.2, 1)"],
      ]),
    });
    expect(warnings).toEqual([]);
    const color = document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    const brand = color.brand;
    if (!isDtcgToken(brand)) throw new Error("expected brand token");
    expect(brand.$value).toBe("oklch(0.5 0.2 240)");
    expect(brand.$type).toBe("color");

    const easing = document.easing;
    if (!isDtcgGroup(easing)) throw new Error("expected easing group");
    const snappy = easing.snappy;
    if (!isDtcgToken(snappy)) throw new Error("expected easing.snappy token");
    expect(snappy.$value).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("warns on unknown prefixes", () => {
    const { warnings } = normalizeToDtcg({
      source: "tailwind-v4",
      data: new Map([["--my-private", "1px"]]),
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("--my-private");
  });
});

describe("normalizeToDtcg — css-vars", () => {
  it("groups by hyphen-separated prefix and infers types", () => {
    const { document, warnings } = normalizeToDtcg({
      source: "css-vars",
      data: new Map([
        ["--brand-primary", "#2563eb"],
        ["--space-md", "1rem"],
        ["--motion-fast", "150ms"],
      ]),
    });
    expect(warnings).toEqual([]);
    const brand = document.brand;
    if (!isDtcgGroup(brand)) throw new Error("expected brand group");
    const primary = brand.primary;
    if (!isDtcgToken(primary)) throw new Error("expected primary token");
    expect(primary.$value).toBe("#2563eb");
    expect(primary.$type).toBe("color");
    const motion = document.motion;
    if (!isDtcgGroup(motion)) throw new Error("expected motion group");
    const fast = motion.fast;
    if (!isDtcgToken(fast)) throw new Error("expected motion.fast token");
    expect(fast.$type).toBe("duration");
  });

  it("emits a warning when type cannot be inferred", () => {
    const { warnings } = normalizeToDtcg({
      source: "css-vars",
      data: new Map([["--mystery-x", "var(--something-else)"]]),
    });
    expect(warnings.some((w) => w.includes("infer"))).toBe(true);
  });
});

describe("normalizeToDtcg — theme-ts", () => {
  it("converts a JS theme export to DTCG groups", () => {
    const { document, warnings } = normalizeToDtcg({
      source: "theme-ts",
      data: {
        colors: { brand: { primary: "#2563eb" } },
        spacing: { md: "16px" },
        zIndex: { modal: 100 },
      },
    });
    expect(warnings).toEqual([]);
    const color = document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    const brand = color.brand;
    if (!isDtcgGroup(brand)) throw new Error("expected brand group");
    const primary = brand.primary;
    if (!isDtcgToken(primary)) throw new Error("expected primary token");
    expect(primary.$value).toBe("#2563eb");
    const zIndex = document.zIndex;
    if (!isDtcgGroup(zIndex)) throw new Error("expected zIndex group");
    const modal = zIndex.modal;
    if (!isDtcgToken(modal)) throw new Error("expected zIndex.modal token");
    expect(modal.$value).toBe(100);
  });

  it("warns on unknown top-level keys", () => {
    const { warnings } = normalizeToDtcg({
      source: "theme-ts",
      data: { whatever: { x: "y" } },
    });
    expect(warnings.some((w) => w.includes("whatever"))).toBe(true);
  });
});

describe("normalizeToDtcg — dtcg passthrough", () => {
  it("does not double-wrap valid DTCG input", () => {
    const input = {
      color: {
        brand: { primary: { $value: "#2563eb", $type: "color" as const } },
      },
    };
    const { document, warnings } = normalizeToDtcg({ source: "dtcg", data: input });
    expect(warnings).toEqual([]);
    const color = document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    const brand = color.brand;
    if (!isDtcgGroup(brand)) throw new Error("expected brand group");
    const primary = brand.primary;
    if (!isDtcgToken(primary)) throw new Error("expected primary token");
    expect(primary.$value).toBe("#2563eb");
    expect(primary.$type).toBe("color");
  });

  it("preserves aliases without flagging missing $type", () => {
    const input = {
      semantic: {
        action: { $value: "{color.brand.primary}" },
      },
    };
    const { warnings } = normalizeToDtcg({ source: "dtcg", data: input });
    expect(warnings).toEqual([]);
  });

  it("warns when a token has no $type and no alias", () => {
    const input = { color: { brand: { $value: "#fff" } } };
    const { warnings } = normalizeToDtcg({ source: "dtcg", data: input });
    expect(warnings.some((w) => w.includes("no $type"))).toBe(true);
  });

  it("preserves composite shadow value byte-for-byte", () => {
    const composite = {
      color: "#000",
      offsetX: "0px",
      offsetY: "1px",
      blur: "2px",
      spread: "0px",
    };
    const input = {
      shadow: { sm: { $value: composite, $type: "shadow" as const } },
    };
    const { document } = normalizeToDtcg({ source: "dtcg", data: input });
    const shadow = document.shadow;
    if (!isDtcgGroup(shadow)) throw new Error("expected shadow group");
    const sm = shadow.sm;
    if (!isDtcgToken(sm)) throw new Error("expected shadow.sm token");
    expect(sm.$value).toEqual(composite);
  });
});
