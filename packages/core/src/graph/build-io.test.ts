import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraphForRoot } from "./build-io.js";

describe("buildGraphForRoot", () => {
  it("builds a graph (rule-free) from a repo root", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-io-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({ color: { p: { $value: "#3b82f6", $type: "color" } } }));
    const g = await buildGraphForRoot(root);
    expect(g.schemaVersion).toBe(1);
    expect(g.tokens.some((t) => t.rawValue === "#3b82f6")).toBe(true);
  });

  it("ds-self repo (workspace DS export, no config): resolves components the same way audit does", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-io-dsself-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "acme-monorepo",
        private: true,
        workspaces: ["packages/*"],
        dependencies: { "@acme/components": "workspace:*" },
      }),
    );
    mkdirSync(join(root, "packages", "components", "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", "components", "package.json"),
      JSON.stringify({ name: "@acme/components", version: "1.0.0" }),
    );
    writeFileSync(
      join(root, "packages", "components", "src", "Button.tsx"),
      [
        `export function Button({ variant }: { variant: "primary" | "secondary" }) {`,
        `  return null;`,
        `}`,
      ].join("\n"),
    );
    writeFileSync(
      join(root, "packages", "components", "src", "Card.tsx"),
      `export function Card() {\n  return null;\n}\n`,
    );

    const g = await buildGraphForRoot(root);

    expect(g.components).toHaveLength(2);
    expect(g.components.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
    expect(g.components.every((c) => c.module === "@acme/components")).toBe(true);
  });

  it("configured designSystem.componentsModule (.lyse.yaml): honours config even without workspace detection", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-io-configured-"));
    writeFileSync(
      join(root, ".lyse.yaml"),
      ["designSystem:", '  componentsModule: "@acme/ui"', ""].join("\n"),
    );
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "consumer.tsx"),
      [
        `import { Button } from "@acme/ui";`,
        ``,
        `export function ConsumerApp() {`,
        `  return Button;`,
        `}`,
      ].join("\n"),
    );

    const g = await buildGraphForRoot(root);

    expect(g.components.some((c) => c.name === "Button" && c.module === "@acme/ui")).toBe(true);
  });
});
