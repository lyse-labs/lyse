import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectStack,
  detectFramework,
  detectStyling,
  detectTestRunners,
} from "../../src/commands/init-detect.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-detect-"));
});

function writePkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "t", version: "1.0.0", dependencies: deps, devDependencies: devDeps }),
  );
}

describe("detectFramework", () => {
  it("detects react", () => {
    expect(detectFramework({ react: "^18.0.0" })).toBe("react");
  });
  it("detects vue", () => {
    expect(detectFramework({ vue: "^3.0.0" })).toBe("vue");
  });
  it("detects solid", () => {
    expect(detectFramework({ "solid-js": "^1.0.0" })).toBe("solid");
  });
  it("detects svelte", () => {
    expect(detectFramework({ svelte: "^4.0.0" })).toBe("svelte");
  });
  it("returns unknown when no framework dep", () => {
    expect(detectFramework({})).toBe("unknown");
  });
  it("prefers react over vue when both present", () => {
    expect(detectFramework({ react: "^18", vue: "^3" })).toBe("react");
  });
});

describe("detectStyling", () => {
  it("returns tailwind-v3 for tailwindcss ^3.x.x", () => {
    expect(detectStyling({ tailwindcss: "^3.4.0" }, dir)).toBe("tailwind-v3");
  });
  it("returns tailwind-v4 for tailwindcss ^4.x.x", () => {
    expect(detectStyling({ tailwindcss: "^4.0.0" }, dir)).toBe("tailwind-v4");
  });
  it("detects vanilla-extract", () => {
    expect(detectStyling({ "@vanilla-extract/css": "^1.0.0" }, dir)).toBe("vanilla-extract");
  });
  it("detects emotion", () => {
    expect(detectStyling({ "@emotion/react": "^11.0.0" }, dir)).toBe("emotion");
  });
  it("detects styled-components", () => {
    expect(detectStyling({ "styled-components": "^6.0.0" }, dir)).toBe("styled-components");
  });
  it("detects css-modules via .module.css file presence", () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/Button.module.css"), ".btn{}");
    expect(detectStyling({}, dir)).toBe("css-modules");
  });
  it("upgrades to tailwind-v4 when CSS contains @theme + tailwindcss import", () => {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/globals.css"), '@import "tailwindcss";\n@theme {\n  --color-brand: #f00;\n}\n');
    expect(detectStyling({ tailwindcss: "next" }, dir)).toBe("tailwind-v4");
  });
});

describe("detectTestRunners", () => {
  it("detects vitest", () => {
    expect(detectTestRunners({ vitest: "^1.0.0" })).toEqual(["vitest"]);
  });
  it("detects jest", () => {
    expect(detectTestRunners({ jest: "^29.0.0" })).toEqual(["jest"]);
  });
  it("detects playwright", () => {
    expect(detectTestRunners({ "@playwright/test": "^1.0.0" })).toEqual(["playwright"]);
  });
  it("detects multiple runners", () => {
    expect(detectTestRunners({ vitest: "^1", "@playwright/test": "^1" })).toEqual([
      "vitest",
      "playwright",
    ]);
  });
  it("returns [none] when no test runner", () => {
    expect(detectTestRunners({})).toEqual(["none"]);
  });
});

describe("detectStack", () => {
  it("returns a full stack snapshot for a React + Vitest + Tailwind v3 repo", () => {
    writePkg({ react: "^18.0.0" }, { tailwindcss: "^3.4.0", vitest: "^1.0.0", typescript: "^5.0.0" });
    const stack = detectStack(dir);
    expect(stack.framework).toBe("react");
    expect(stack.styling).toBe("tailwind-v3");
    expect(stack.hasTypeScript).toBe(true);
    expect(stack.testRunners).toEqual(["vitest"]);
  });
  it("detects TS via tsconfig.json even without typescript dep", () => {
    writePkg({ react: "^18.0.0" }, {});
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    expect(detectStack(dir).hasTypeScript).toBe(true);
  });
  it("handles a missing package.json gracefully", () => {
    const stack = detectStack(dir);
    expect(stack.framework).toBe("unknown");
    expect(stack.styling).toBe("unknown");
    expect(stack.testRunners).toEqual(["none"]);
  });
});
