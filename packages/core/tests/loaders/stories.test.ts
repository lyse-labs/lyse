import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStories } from "../../src/loaders/stories.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "lyse-sb-"));
}

function writeSrcFile(root: string, name: string, content: string): string {
  const dir = join(root, "src");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// ── Original loadStories tests ────────────────────────────────────────────

describe("loadStories — original tests", () => {
  it("loads from storybook-static/index.json", async () => {
    const root = makeTempDir();
    mkdirSync(join(root, "storybook-static"));
    writeFileSync(join(root, "storybook-static", "index.json"), JSON.stringify({
      v: 4,
      entries: {
        "components-button--primary": {
          type: "story", id: "components-button--primary", name: "Primary",
          title: "Components/Button", importPath: "src/Button.stories.tsx",
        },
      },
    }));
    const idx = await loadStories(root);
    expect(idx!.byTitle.get("Button")).toBeDefined();
  });

  it("falls back to filesystem scan", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `export default { title: "Components/Button" };`);
    const idx = await loadStories(root);
    expect(idx!.byTitle.get("Button")).toBeDefined();
  });

  it("returns null when nothing found", async () => {
    const root = makeTempDir();
    expect(await loadStories(root)).toBeNull();
  });
});

// ── CSF v3 parser — loadStories extension ────────────────────────────────

describe("loadStories — CSF v3 parsing (filesystem scan)", () => {
  it("extracts componentName from default export `component` field", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
import { Button } from "@acme/ui";
export default { component: Button, title: "Components/Button" };
export const Primary = { args: { variant: "primary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry).toBeDefined();
    expect(entry!.componentName).toBe("Button");
  });

  it("extracts named story exports with args", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
import { Button } from "@acme/ui";
export default { component: Button, title: "Components/Button" };
export const Primary = { args: { variant: "primary" } };
export const Secondary = { args: { variant: "secondary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.stories).toBeDefined();
    expect(entry!.stories!).toHaveLength(2);
    expect(entry!.stories![0]!.name).toBe("Primary");
    expect(entry!.stories![0]!.args).toEqual({ variant: "primary" });
    expect(entry!.stories![1]!.name).toBe("Secondary");
    expect(entry!.stories![1]!.args).toEqual({ variant: "secondary" });
  });

  it("extracts multiple args types (string, number, boolean)", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button" };
export const WithAllArgs = { args: { variant: "ghost", size: 40, disabled: true } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.stories![0]!.args).toEqual({ variant: "ghost", size: 40, disabled: true });
  });

  it("handles TypeScript StoryObj type annotation", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
import type { StoryObj } from "@storybook/react";
import { Button } from "@acme/ui";
export default { component: Button, title: "Button" };
export const Primary: StoryObj<typeof Button> = { args: { variant: "primary" } };
export const Secondary: StoryObj = { args: { variant: "secondary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.componentName).toBe("Button");
    expect(entry!.stories!).toHaveLength(2);
    expect(entry!.stories![0]!.args?.variant).toBe("primary");
    expect(entry!.stories![1]!.args?.variant).toBe("secondary");
  });

  it("skips factory-pattern stories (non-object-expression exports)", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button" };
export const Primary = makeStory({ variant: "primary" });
export const Secondary = defineMeta({ args: { variant: "secondary" } });
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    // Factory-pattern exports are skipped — stories array is empty
    expect(entry!.stories ?? []).toHaveLength(0);
  });

  it("handles story with no args property", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button" };
export const Default = {};
export const WithArgs = { args: { variant: "primary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.stories!).toHaveLength(2);
    // Default has no args
    expect(entry!.stories![0]!.args).toBeUndefined();
    // WithArgs has args
    expect(entry!.stories![1]!.args?.variant).toBe("primary");
  });

  it("skips complex args values (template literals, function refs)", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button" };
export const Complex = { args: { label: \`hello\`, onClick: () => {}, variant: "primary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.stories!).toHaveLength(1);
    // Only the simple literal `variant: "primary"` should be extracted
    // Template literal (label) and function ref (onClick) are skipped
    expect(entry!.stories![0]!.args).toEqual({ variant: "primary" });
  });

  it("handles story file at nested path", async () => {
    const root = makeTempDir();
    mkdirSync(join(root, "src", "components", "button"), { recursive: true });
    writeFileSync(join(root, "src", "components", "button", "Button.stories.tsx"), `
export default { title: "Components/Button" };
export const Primary = { args: { variant: "primary" } };
`);
    const idx = await loadStories(root);
    expect(idx!.byTitle.get("Button")).toBeDefined();
    expect(idx!.byTitle.get("Button")!.stories).toHaveLength(1);
  });

  it("handles multiple story files for different components", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button" };
export const Primary = { args: { variant: "primary" } };
`);
    writeSrcFile(root, "Card.stories.tsx", `
export default { title: "Card" };
export const Default = { args: { size: "md" } };
`);
    const idx = await loadStories(root);
    expect(idx!.byTitle.size).toBe(2);
    expect(idx!.byTitle.get("Button")).toBeDefined();
    expect(idx!.byTitle.get("Card")).toBeDefined();
    expect(idx!.byTitle.get("Button")!.stories![0]!.args?.variant).toBe("primary");
    expect(idx!.byTitle.get("Card")!.stories![0]!.args?.size).toBe("md");
  });

  it("importPath is set relative to root", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `export default { title: "Button" };`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.importPath).toBe("src/Button.stories.tsx");
  });

  it("returns entry with no componentName when default export has no component field", async () => {
    const root = makeTempDir();
    writeSrcFile(root, "Button.stories.tsx", `
export default { title: "Button", parameters: { docs: { page: null } } };
export const Primary = { args: { variant: "primary" } };
`);
    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry!.componentName).toBeUndefined();
    expect(entry!.stories![0]!.args?.variant).toBe("primary");
  });
});

// ── CSF v3 parsing from storybook-static/index.json path ─────────────────

describe("loadStories — CSF v3 parsing (static index path)", () => {
  it("parses story file referenced from storybook-static/index.json", async () => {
    const root = makeTempDir();
    mkdirSync(join(root, "storybook-static"));
    mkdirSync(join(root, "src"), { recursive: true });

    writeFileSync(join(root, "src", "Button.stories.tsx"), `
import { Button } from "@acme/ui";
export default { component: Button, title: "Components/Button" };
export const Primary = { args: { variant: "primary" } };
export const Secondary = { args: { variant: "secondary" } };
`);
    writeFileSync(join(root, "storybook-static", "index.json"), JSON.stringify({
      v: 4,
      entries: {
        "components-button--primary": {
          type: "story", id: "components-button--primary", name: "Primary",
          title: "Components/Button", importPath: "src/Button.stories.tsx",
        },
        "components-button--secondary": {
          type: "story", id: "components-button--secondary", name: "Secondary",
          title: "Components/Button", importPath: "src/Button.stories.tsx",
        },
      },
    }));

    const idx = await loadStories(root);
    const entry = idx!.byTitle.get("Button");
    expect(entry).toBeDefined();
    expect(entry!.componentName).toBe("Button");
    expect(entry!.stories).toBeDefined();
    // stories should have Primary and Secondary
    const variantArgs = entry!.stories!.map((s) => s.args?.variant);
    expect(variantArgs).toContain("primary");
    expect(variantArgs).toContain("secondary");
  });

  it("gracefully handles missing source file referenced in index.json", async () => {
    const root = makeTempDir();
    mkdirSync(join(root, "storybook-static"));
    // NOTE: source file NOT written — index.json references a non-existent file
    writeFileSync(join(root, "storybook-static", "index.json"), JSON.stringify({
      v: 4,
      entries: {
        "components-button--primary": {
          type: "story", id: "components-button--primary", name: "Primary",
          title: "Components/Button", importPath: "src/Button.stories.tsx",
        },
      },
    }));
    const idx = await loadStories(root);
    // Should still return an index with the entry (from static JSON), just no stories parsed
    expect(idx).not.toBeNull();
    const entry = idx!.byTitle.get("Button");
    expect(entry).toBeDefined();
    expect(entry!.stories).toBeUndefined();
  });
});
