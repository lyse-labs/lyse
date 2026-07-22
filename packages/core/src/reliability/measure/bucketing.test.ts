import { describe, it, expect } from "vitest";
import { groupIntoBuckets } from "./bucketing.js";
import { bucketKey } from "./bucket.js";
import type { FindingRow } from "./finding-row.js";
import type { ZoneKind } from "../../graph/types.js";

describe("groupIntoBuckets", () => {
  it("groups two rows with same (ruleId, resolutionClass, zone) into one bucket", () => {
    const row1: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/colors.ts",
      line: 10,
      snippet: "const red = '#ff0000';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const row2: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/buttons.ts",
      line: 5,
      snippet: "color: '#ff0000'",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };

    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([row1, row2], zoneForRow);

    expect(buckets.size).toBe(1);
    const key = bucketKey("tokens/no-hardcoded-color", "exact", "app");
    expect(buckets.has(key)).toBe(true);
    expect(buckets.get(key)).toEqual([row1, row2]);
  });

  it("splits rows with different resolutionClass into separate buckets", () => {
    const row1: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/colors.ts",
      line: 10,
      snippet: "const red = '#ff0000';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const row2: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/buttons.ts",
      line: 5,
      snippet: "color: '#ff0001'",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "near",
    };

    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([row1, row2], zoneForRow);

    expect(buckets.size).toBe(2);
    const exactKey = bucketKey("tokens/no-hardcoded-color", "exact", "app");
    const nearKey = bucketKey("tokens/no-hardcoded-color", "near", "app");
    expect(buckets.get(exactKey)).toEqual([row1]);
    expect(buckets.get(nearKey)).toEqual([row2]);
  });

  it("splits rows with different zones into separate buckets", () => {
    const row1: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/colors.ts",
      line: 10,
      snippet: "const red = '#ff0000';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const row2: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/stories/colors.stories.ts",
      line: 5,
      snippet: "color: '#ff0000'",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };

    const zoneForRow = (r: FindingRow): ZoneKind =>
      r.file.includes("stories") ? "story" : "app";
    const buckets = groupIntoBuckets([row1, row2], zoneForRow);

    expect(buckets.size).toBe(2);
    const appKey = bucketKey("tokens/no-hardcoded-color", "exact", "app");
    const storyKey = bucketKey("tokens/no-hardcoded-color", "exact", "story");
    expect(buckets.get(appKey)).toEqual([row1]);
    expect(buckets.get(storyKey)).toEqual([row2]);
  });

  it("buckets a row without resolutionClass under class 'n/a'", () => {
    const row: FindingRow = {
      ruleId: "a11y/essentials",
      repo: "test-repo",
      file: "src/components/Button.tsx",
      line: 12,
      snippet: "<button>Click</button>",
      fileType: "tsx",
      confidence: "medium",
    };

    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([row], zoneForRow);

    expect(buckets.size).toBe(1);
    const naKey = bucketKey("a11y/essentials", "n/a", "app");
    expect(buckets.has(naKey)).toBe(true);
    expect(buckets.get(naKey)).toEqual([row]);
  });

  it("groups mixed rows with and without resolutionClass correctly", () => {
    const withClass: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/colors.ts",
      line: 10,
      snippet: "const red = '#ff0000';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const withoutClass: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/components/Button.tsx",
      line: 12,
      snippet: "<button>Click</button>",
      fileType: "tsx",
      confidence: "medium",
    };

    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([withClass, withoutClass], zoneForRow);

    expect(buckets.size).toBe(2);
    const exactKey = bucketKey("tokens/no-hardcoded-color", "exact", "app");
    const naKey = bucketKey("tokens/no-hardcoded-color", "n/a", "app");
    expect(buckets.get(exactKey)).toEqual([withClass]);
    expect(buckets.get(naKey)).toEqual([withoutClass]);
  });

  it("returns an empty Map when given an empty row list", () => {
    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([], zoneForRow);

    expect(buckets.size).toBe(0);
    expect(buckets instanceof Map).toBe(true);
  });

  it("preserves row order within each bucket", () => {
    const row1: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/a.ts",
      line: 1,
      snippet: "const red = '#ff0000';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const row2: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/b.ts",
      line: 2,
      snippet: "const blue = '#0000ff';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };
    const row3: FindingRow = {
      ruleId: "tokens/no-hardcoded-color",
      repo: "test-repo",
      file: "src/c.ts",
      line: 3,
      snippet: "const green = '#00ff00';",
      fileType: "ts",
      confidence: "high",
      resolutionClass: "exact",
    };

    const zoneForRow = (_r: FindingRow): ZoneKind => "app";
    const buckets = groupIntoBuckets([row1, row2, row3], zoneForRow);

    const key = bucketKey("tokens/no-hardcoded-color", "exact", "app");
    expect(buckets.get(key)).toEqual([row1, row2, row3]);
  });
});
