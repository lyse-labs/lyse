import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-presence", version: "1.0.0" });

export interface PresenceSpec {
  ruleId: string;
  requiredPath: string;
  goodContent: string;
}

export function makePresenceAdapter(spec: PresenceSpec): OracleAdapter {
  const clean = (): FixtureFiles => ({ "package.json": PKG, [spec.requiredPath]: spec.goodContent });
  return {
    ruleId: spec.ruleId,
    oracleKind: "construction",
    cleanFixture: clean,
    mutations: [
      {
        name: "missing-file",
        apply: (f) => {
          const next = { ...f };
          delete next[spec.requiredPath];
          return next;
        },
      },
    ],
    metamorphic: [],
  };
}

// Each entry verified against registry.ts and the rule's source before inclusion.
// requiredPath must be a filename the rule actually checks; goodContent must
// satisfy the rule's structured-content check (not just file presence).
export const presenceAdapters: OracleAdapter[] = [
  makePresenceAdapter({
    ruleId: "versioning/changelog-present",
    requiredPath: "CHANGELOG.md",
    goodContent: "# Changelog\n\n## [1.0.0]\n- initial release\n",
  }),
];
