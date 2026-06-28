import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyColorRole } from "../../src/rules/_color-ast-role.js";

let dir: string;
function write(rel: string, src: string): { file: string; line: number; column: number } {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, src);
  const idx = src.indexOf("#");
  const before = src.slice(0, idx);
  const line = before.split("\n").length;
  const column = idx - before.lastIndexOf("\n");
  return { file: rel, line, column };
}

describe("classifyColorRole", () => {
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "role-")); });

  it("classifies canvas fillStyle assignment as canvas", () => {
    const loc = write("a.ts", "function draw(c: CanvasRenderingContext2D){ c.fillStyle = '#ffffff'; }");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("canvas");
  });

  it("classifies a default prop value as default-prop", () => {
    const loc = write("b.tsx", "export const Icon = ({ color = '#2563eb' }: { color?: string }) => <svg/>;");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("default-prop");
  });

  it("classifies fill on an SVG element as svg-art", () => {
    const loc = write("c.tsx", "export const I = () => <svg><path fill='#2563eb' /></svg>;");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("svg-art");
  });

  it("classifies a styled component color property as styling (drift)", () => {
    const loc = write("d.tsx", "const Box = styled.div({ color: '#2563eb' });");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("styling");
  });

  it("returns unknown when the position has no resolvable node", () => {
    const loc = { file: "missing.ts", line: 1, column: 1 };
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("unknown");
  });

  it("classifies a nested color in defaultProps as styling (not default-prop)", () => {
    const loc = write("e.tsx", "SomeComponent.defaultProps = { theme: { color: '#2563eb' } };");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("styling");
  });
});
