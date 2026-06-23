import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStorybook, listStories } from "../../src/render/storybook-source.js";

function tmpRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-sb-"));
  for (const [p, c] of Object.entries(files)) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, c, "utf8");
  }
  return dir;
}

describe("resolveStorybook", () => {
  it("returns null when no storybook-static dir exists", () => {
    const dir = tmpRepo({ "package.json": "{}" });
    expect(resolveStorybook(dir, {})).toBeNull();
  });

  it("finds the default storybook-static/index.json", () => {
    const dir = tmpRepo({ "storybook-static/index.json": '{"v":5,"entries":{}}' });
    const src = resolveStorybook(dir, {});
    expect(src?.kind).toBe("static");
  });

  it("resolves an explicit --storybook dir (relative to repo root)", () => {
    const dir = tmpRepo({ "build/sb/index.json": '{"v":5,"entries":{}}' });
    const src = resolveStorybook(dir, { dir: "build/sb" });
    expect(src?.kind).toBe("static");
  });

  it("resolves a URL source and strips trailing slashes", () => {
    const src = resolveStorybook("/anything", { url: "https://sb.example.com/" });
    expect(src).toEqual({ kind: "url", base: "https://sb.example.com", index: null });
  });
});

describe("listStories", () => {
  it("parses Storybook v7 index.json entries, skips docs, sorts by id", async () => {
    const index = {
      v: 5,
      entries: {
        "button--secondary": { id: "button--secondary", title: "Button", name: "Secondary", type: "story" },
        "button--primary": { id: "button--primary", title: "Button", name: "Primary", type: "story" },
        "button--docs": { id: "button--docs", title: "Button", name: "Docs", type: "docs" },
      },
    };
    const dir = tmpRepo({ "storybook-static/index.json": JSON.stringify(index) });
    const src = resolveStorybook(dir, {})!;
    const stories = await listStories(src);
    expect(stories.map((s) => s.id)).toEqual(["button--primary", "button--secondary"]);
    expect(stories[0]!.url).toContain("iframe.html?id=button--primary");
    expect(stories[0]!.url.startsWith("file://")).toBe(true);
  });

  it("falls back to the legacy stories.json shape", async () => {
    const legacy = { v: 3, stories: { "card--default": { id: "card--default", title: "Card", name: "Default" } } };
    const dir = tmpRepo({ "storybook-static/stories.json": JSON.stringify(legacy) });
    const src = resolveStorybook(dir, {})!;
    const stories = await listStories(src);
    expect(stories.map((s) => s.id)).toEqual(["card--default"]);
  });
});
