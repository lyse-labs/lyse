import { describe, it, expect } from "vitest";
import { parseBenchYaml } from "../../scripts/clone-bench-corpus.js";

const YAML = `- repo: shadcn-ui/ui
  url: https://github.com/shadcn-ui/ui
  sha: 4a4dc8eb0fc793d8e9225e780183ad605f15d2c2
  framework: react
- repo: mantinedev/mantine
  url: https://github.com/mantinedev/mantine
  sha: babd4ef64a41791a209bb671d10ea9e001824bb5`;

describe("parseBenchYaml", () => {
  it("extracts repo/url/sha entries", () => {
    const entries = parseBenchYaml(YAML);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      repo: "shadcn-ui/ui",
      url: "https://github.com/shadcn-ui/ui",
      sha: "4a4dc8eb0fc793d8e9225e780183ad605f15d2c2",
    });
  });
});
