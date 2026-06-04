import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-shadow-native.js";
import type { Finding, ClassifyContext } from "../../src/types.js";

function makeCtx(): ClassifyContext {
  return {
    tokens: {
      colors: new Map(),
      spacing: new Map(),
      typography: new Map(),
      radii: new Map(),
      shadows: new Map(),
      motion: new Map(),
      breakpoints: new Map(),
      zIndex: new Map(),
      opacity: new Map(),
      borderWidth: new Map(),
      source: "tailwind-v3",
    },
    components: new Set(["Button", "Link", "Input"]),
    config: {},
  };
}

function makeFinding(message: string, context?: string): Finding {
  return {
    ruleId: "components/no-native-shadows",
    axis: "components",
    severity: "warning",
    location: { file: "src/Page.tsx", line: 12, column: 1 },
    message,
    ...(context !== undefined && { context }),
  };
}

describe("components/no-native-shadows classifyConfidence", () => {
  it("returns high for a simple native button with no className or styled wrapper", () => {
    const finding = makeFinding(
      "Native <button> used where <Button> from @acme/ui is available",
      "<button>Submit</button>",
    );
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("returns medium when className is present on the native element", () => {
    const finding = makeFinding(
      "Native <button> used where <Button> from @acme/ui is available",
      '<button className="btn-primary">Submit</button>',
    );
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("medium");
  });

  it("returns low for an external link (href with https://)", () => {
    const finding = makeFinding(
      "Native <a> used where <Link> from @acme/ui is available",
      '<a href="https://example.com">Visit</a>',
    );
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("low");
  });

  it("returns low when a styled-components wrapper is detected", () => {
    const finding = makeFinding(
      "Native <button> used where <Button> from @acme/ui is available",
      "const StyledBtn = styled.button`color: red;`",
    );
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("low");
  });
});
