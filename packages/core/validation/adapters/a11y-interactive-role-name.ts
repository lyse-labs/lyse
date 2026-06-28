import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-irn", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Button.tsx": [
      "export const SaveButton = () => <button>Save</button>;",
      'export const CloseButton = () => <button aria-label="Close dialog"><svg aria-hidden="true" /></button>;',
    ].join("\n"),
  };
}

export const interactiveRoleNameAdapter: OracleAdapter = {
  ruleId: "a11y/interactive-role-name",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    {
      name: "icon-only-button-no-name",
      apply: (f: FixtureFiles) => ({
        ...f,
        "src/Button.tsx": "export const IconBtn = () => <button><svg /></button>;",
      }),
    },
  ],
  metamorphic: [],
};
