import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectFromPackageJson } from "../../src/detection/from-package-json.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "lyse-pkg-")); });

describe("detectFromPackageJson", () => {
  it("detects React from dependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.framework.value).toBe("react");
    expect(r.framework.confidence).toBe("high");
  });

  it("prefers internal-named componentsModule over public lib", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@my-org/ui": "^1.0.0", "@mui/material": "^5.0.0" }
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@my-org/ui");
  });

  it("falls back to common UI library if no internal package", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@mui/material": "^5.0.0" }
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mui/material");
    expect(r.componentsModule.confidence).toBe("medium");
  });

  it("detects Storybook from devDependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { "@storybook/react": "^7.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.storybook.value).toBe(true);
  });

  it("detects pnpm from packageManager field", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@9.12.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.packageManager.value).toBe("pnpm");
  });

  it("returns null values when package.json absent", async () => {
    const r = await detectFromPackageJson(dir);
    expect(r.framework.value).toBe(null);
    expect(r.componentsModule.value).toBe(null);
  });

  it("detects TypeScript from devDependencies", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }));
    const r = await detectFromPackageJson(dir);
    expect(r.hasTypeScript.value).toBe(true);
  });
});

describe("detectComponentsModule — workspace DS-self detection", () => {
  it("detects @primer/react when root is private with workspaces", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "react"), { recursive: true });
    writeFileSync(join(dir, "packages", "react", "package.json"), JSON.stringify({ name: "@primer/react", version: "36.0.0" }));
    mkdirSync(join(dir, "packages", "build-tooling"), { recursive: true });
    writeFileSync(join(dir, "packages", "build-tooling", "package.json"), JSON.stringify({ name: "@primer/build-tooling", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@primer/react");
    expect(r.componentsModule.confidence).toBe("high");
    expect(r.componentsModule.source).toContain("workspace");
  });

  it("detects @mui/material with workspaces and ignores internal packages", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "material"), { recursive: true });
    writeFileSync(join(dir, "packages", "material", "package.json"), JSON.stringify({ name: "@mui/material", version: "6.0.0" }));
    mkdirSync(join(dir, "packages", "internal-test-utils"), { recursive: true });
    writeFileSync(join(dir, "packages", "internal-test-utils", "package.json"), JSON.stringify({ name: "@mui/internal-test-utils", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mui/material");
    expect(r.componentsModule.confidence).toBe("high");
  });

  it("returns null when workspaces exist but no DS-named package found", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      devDependencies: { typescript: "^5.0.0" },
    }));
    mkdirSync(join(dir, "packages", "utils"), { recursive: true });
    writeFileSync(join(dir, "packages", "utils", "package.json"), JSON.stringify({ name: "@foo/bar-utils", version: "1.0.0" }));
    mkdirSync(join(dir, "packages", "build-tools"), { recursive: true });
    writeFileSync(join(dir, "packages", "build-tools", "package.json"), JSON.stringify({ name: "@foo/build-tools", version: "1.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBeNull();
  });

  it("does NOT false-positive on @vitest/ui (denylist)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      devDependencies: { "@vitest/ui": "^2.0.0", react: "^18.0.0" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBeNull();
  });

  it("falls back to legacy detection when no workspaces", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@calcom/ui": "^1.0.0" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@calcom/ui");
    expect(r.componentsModule.confidence).toBe("high");
  });

  it("supports workspaces as { packages: [...] } object format", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: { packages: ["packages/*"] },
      devDependencies: {},
    }));
    mkdirSync(join(dir, "packages", "core"), { recursive: true });
    writeFileSync(join(dir, "packages", "core", "package.json"), JSON.stringify({ name: "@mantine/core", version: "7.0.0" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@mantine/core");
    expect(r.componentsModule.confidence).toBe("high");
  });
});

describe("detectComponentsModule — self-DS vs consumer (P0)", () => {
  it("self-DS monorepo: workspace-owned @org/components → workspace DS export (dsSelfMode-eligible)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@acme/components": "workspace:*" },
    }));
    mkdirSync(join(dir, "packages", "components"), { recursive: true });
    writeFileSync(join(dir, "packages", "components", "package.json"), JSON.stringify({ name: "@acme/components" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.source.startsWith("workspace DS export")).toBe(true);
  });

  it("consumer app: external @org/ui dependency → internal-named UI package (NOT self-DS)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      dependencies: { "@acme/ui": "^1.2.3" },
    }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.source.startsWith("workspace DS export")).toBe(false);
    expect(r.componentsModule.value).toBe("@acme/ui");
  });
});

describe("detectComponentsModule — ownership guard gated on pkg.private (regression)", () => {
  it("non-private root with workspaces + workspace-member UI dep → still returns internal-named UI package", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      workspaces: ["packages/*"],
      dependencies: { "@acme/ui": "^1.0.0" },
    }));
    mkdirSync(join(dir, "packages", "ui"), { recursive: true });
    writeFileSync(join(dir, "packages", "ui", "package.json"), JSON.stringify({ name: "@acme/ui" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@acme/ui");
    expect(r.componentsModule.source).toBe("internal-named UI package");
  });

  it("private monorepo with an external, non-member UI dep → internal-named UI package (not self-DS)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true,
      workspaces: ["packages/*"],
      dependencies: { "@external/ui": "^2.0.0" },
    }));
    mkdirSync(join(dir, "packages", "core"), { recursive: true });
    writeFileSync(join(dir, "packages", "core", "package.json"), JSON.stringify({ name: "@acme/core" }));
    const r = await detectFromPackageJson(dir);
    expect(r.componentsModule.value).toBe("@external/ui");
    expect(r.componentsModule.source).toBe("internal-named UI package");
    expect(r.componentsModule.source.startsWith("workspace DS export")).toBe(false);
  });
});
