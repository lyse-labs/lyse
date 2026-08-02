import { describe, it, expect } from "vitest";
import {
  badEnumValues,
  assertEnumValues,
  AUDIT_ENUM_FLAGS,
  EXPLAIN_ENUM_FLAGS,
} from "../enum-flags.js";

const SPECS = [
  { flag: "scope", values: ["changed", "staged", "uncommitted", "new"] },
  { flag: "format", values: ["json", "text", "eslint"] },
] as const;

describe("badEnumValues", () => {
  it("returns nothing when every value is one of the accepted ones", () => {
    expect(badEnumValues({ scope: "new", format: "json" }, SPECS)).toEqual([]);
  });

  it("returns nothing when the flag was not passed", () => {
    expect(badEnumValues({ root: "." }, SPECS)).toEqual([]);
  });

  it("catches the case typo that silently disabled the CI gate", () => {
    expect(badEnumValues({ scope: "New" }, SPECS)).toEqual([
      { flag: "scope", value: "New", suggestion: "new", values: SPECS[0].values },
    ]);
  });

  it("catches a misspelling with no near match and offers none", () => {
    expect(badEnumValues({ scope: "nw" }, SPECS)).toEqual([
      { flag: "scope", value: "nw", values: SPECS[0].values },
    ]);
  });

  it("catches every offending flag in one pass, in spec order", () => {
    expect(badEnumValues({ scope: "nope", format: "Sarif" }, SPECS).map((b) => b.flag)).toEqual([
      "scope",
      "format",
    ]);
  });

  it("rejects an empty value rather than treating it as unset", () => {
    expect(badEnumValues({ scope: "" }, SPECS)).toHaveLength(1);
  });

  it("rejects a non-string value", () => {
    expect(badEnumValues({ scope: true }, SPECS)).toEqual([
      { flag: "scope", value: "true", values: SPECS[0].values },
    ]);
  });

  it("ignores an undefined or null value — the flag is simply absent", () => {
    expect(badEnumValues({ scope: undefined, format: null }, SPECS)).toEqual([]);
  });
});

describe("assertEnumValues", () => {
  it("throws a usage error naming the flag, the value and what is accepted", () => {
    expect(() => assertEnumValues({ scope: "New" }, SPECS, "audit")).toThrowError(
      /--scope=New.*changed, staged, uncommitted, new/s,
    );
  });

  it("suggests the correct spelling when the value differs only by case", () => {
    expect(() => assertEnumValues({ scope: "NEW" }, SPECS, "audit")).toThrowError(/did you mean `new`/);
  });

  it("does not throw on a valid value", () => {
    expect(() => assertEnumValues({ scope: "new" }, SPECS, "audit")).not.toThrow();
  });
});

describe("AUDIT_ENUM_FLAGS", () => {
  it("accepts every --scope value the CLI implements", () => {
    for (const scope of ["changed", "staged", "uncommitted", "new"]) {
      expect(badEnumValues({ scope }, AUDIT_ENUM_FLAGS)).toEqual([]);
    }
  });

  it("accepts every --format value the CLI implements", () => {
    for (const format of ["json", "text", "table", "tsv", "eslint", "legacy", "sarif", "html"]) {
      expect(badEnumValues({ format }, AUDIT_ENUM_FLAGS)).toEqual([]);
    }
  });

  it("rejects the format typo that silently wrote JSON into a SARIF output dir", () => {
    expect(badEnumValues({ format: "Sarif" }, AUDIT_ENUM_FLAGS)).toHaveLength(1);
  });
});

describe("EXPLAIN_ENUM_FLAGS", () => {
  it("accepts both formats `lyse explain` implements", () => {
    for (const format of ["text", "md"]) {
      expect(badEnumValues({ format }, EXPLAIN_ENUM_FLAGS)).toEqual([]);
    }
  });

  it("rejects a format that would have silently rendered text instead", () => {
    expect(badEnumValues({ format: "markdown" }, EXPLAIN_ENUM_FLAGS)).toHaveLength(1);
  });

  it("does not accept the audit-only formats", () => {
    expect(badEnumValues({ format: "sarif" }, EXPLAIN_ENUM_FLAGS)).toHaveLength(1);
  });
});
