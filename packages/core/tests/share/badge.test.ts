import { describe, it, expect } from "vitest";
import { buildBadge } from "../../src/share/badge.js";

describe("buildBadge", () => {
  it("maps grade B (score 78) → green + '78/100 (B)'", () => {
    const b = buildBadge({ score: 78, grade: "B", repoUrl: "https://github.com/o/r" });
    expect(b.endpointJson).toEqual({ schemaVersion: 1, label: "Lyse", message: "78/100 (B)", color: "green" });
    expect(b.staticUrl).toBe("https://img.shields.io/badge/Lyse-78%2F100_(B)-green");
    expect(b.staticMarkdown).toBe(
      "[![Lyse Health Score](https://img.shields.io/badge/Lyse-78%2F100_(B)-green)](https://github.com/o/r)",
    );
  });

  it("color by grade", () => {
    expect(buildBadge({ score: 92, grade: "A", repoUrl: null }).endpointJson.color).toBe("brightgreen");
    expect(buildBadge({ score: 50, grade: "C", repoUrl: null }).endpointJson.color).toBe("yellow");
    expect(buildBadge({ score: 20, grade: "Fail", repoUrl: null }).endpointJson.color).toBe("red");
    expect(buildBadge({ score: "N/A", grade: "N/A", repoUrl: null }).endpointJson.color).toBe("lightgrey");
  });

  it("N/A message", () => {
    expect(buildBadge({ score: "N/A", grade: "N/A", repoUrl: null }).endpointJson.message).toBe("N/A");
  });

  it("drops link wrapper when no repoUrl", () => {
    expect(buildBadge({ score: 78, grade: "B", repoUrl: null }).staticMarkdown).toBe(
      "![Lyse Health Score](https://img.shields.io/badge/Lyse-78%2F100_(B)-green)",
    );
  });

  it("endpointMarkdown references the raw JSON url via shields endpoint", () => {
    const b = buildBadge({ score: 78, grade: "B", repoUrl: "https://github.com/o/r" });
    expect(b.endpointMarkdown("https://raw.githubusercontent.com/o/r/main/.lyse/badge.json")).toBe(
      "[![Lyse Health Score](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fo%2Fr%2Fmain%2F.lyse%2Fbadge.json)](https://github.com/o/r)",
    );
  });
});
