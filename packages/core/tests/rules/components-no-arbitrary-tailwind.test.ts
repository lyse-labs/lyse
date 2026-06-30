import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-no-arbitrary-tailwind.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/repo",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

function makeParsed(tsx: string): ParsedFiles {
  return {
    ts: [{ path: "src/B.tsx", source: tsx, ast: null, imports: [] }],
    css: [],
    cssInJs: [],
  };
}

describe("components/no-arbitrary-tailwind", () => {
  it("flags a non-color arbitrary spacing value (p-[12px])", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="p-[12px]" />;'));
    expect(res.findings.some((f) => f.message.includes("p-[12px]"))).toBe(true);
  });

  it("flags arbitrary text size (text-[14px]) but NOT arbitrary color (text-[#111])", async () => {
    const size = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="text-[14px]" />;'));
    expect(size.findings.length).toBeGreaterThan(0);
    expect(size.findings.some((f) => f.message.includes("text-[14px]"))).toBe(true);

    const color = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="text-[#111]" />;'));
    expect(color.findings, "color brackets belong to tokens/no-hardcoded-color, not this rule").toHaveLength(0);
  });

  it("does NOT flag scale utilities (p-4, text-sm, rounded-md)", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="p-4 text-sm rounded-md" />;'));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag var() token references in brackets (w-[var(--sidebar)])", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="w-[var(--sidebar)]" />;'));
    expect(res.findings).toHaveLength(0);
  });

  it("flags w-[37px] and gap-[10px] and text-[14px] together", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="w-[37px] gap-[10px] text-[14px]" />;'));
    expect(res.findings.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT flag named CSS colors in brackets (bg-[red], text-[blue])", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="bg-[red] text-[blue]" />;'));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag rgb/hsl color functions in brackets", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="bg-[rgb(255,0,0)] text-[hsl(120,50%,50%)]" />;'));
    expect(res.findings).toHaveLength(0);
  });

  it("reports ruleId components/no-arbitrary-tailwind", async () => {
    const res = await rule.evaluate(ctx, makeParsed('export const B = () => <div className="m-[8px]" />;'));
    expect(res.findings[0]?.ruleId).toBe("components/no-arbitrary-tailwind");
    expect(res.findings[0]?.axis).toBe("components");
    expect(res.findings[0]?.severity).toBe("warning");
  });
});
