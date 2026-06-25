import { describe, it, expect } from "vitest";
import { makeFixGroup } from "../../src/rules/_fix-group.js";

describe("makeFixGroup", () => {
  it("resolves a single candidate to `to`", () => {
    const fg = makeFixGroup("tokens/no-hardcoded-color", "#3b82f6", ["color.brand.primary"]);
    expect(fg).toEqual({ key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary" });
  });
  it("omits `to` when zero or many candidates, but still forms a group", () => {
    expect(makeFixGroup("tokens/no-hardcoded-color", "#abc", [])).toEqual({
      key: "tokens/no-hardcoded-color::#abc", from: "#abc",
    });
    expect(makeFixGroup("tokens/no-hardcoded-color", "#abc", ["a", "b"])).toEqual({
      key: "tokens/no-hardcoded-color::#abc", from: "#abc",
    });
    expect(makeFixGroup("tokens/no-hardcoded-color", "#abc", undefined)).toEqual({
      key: "tokens/no-hardcoded-color::#abc", from: "#abc",
    });
  });
  it("returns undefined for an empty `from`", () => {
    expect(makeFixGroup("tokens/no-hardcoded-color", "", ["x"])).toBeUndefined();
  });
});
