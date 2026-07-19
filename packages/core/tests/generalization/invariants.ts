// Honesty invariants (extraction-scoped v1). Each is a mechanical, label-free
// check over a single audit's result + graph. Statuses (enforced / known-gap)
// live per-repo in corpus.ts; this file is pure predicate logic.
import type { AuditResult } from "../../src/types.js";
import type { DesignSystemGraph } from "../../src/graph/types.js";
import type { GenRepo, InvariantId } from "./corpus.js";

export interface AuditObservation {
  result: AuditResult;
  graph: DesignSystemGraph;
}

export interface InvariantResult {
  pass: boolean;
  detail: string;
}

export interface Invariant {
  id: InvariantId;
  title: string;
  check(obs: AuditObservation, repo: GenRepo): InvariantResult;
}

const FRAMEWORK_EXT: Record<string, string> = { vue: ".vue", svelte: ".svelte" };

export const INVARIANTS: Invariant[] = [
  {
    id: "C1",
    title: "token extraction produces token nodes",
    check({ graph }) {
      const n = graph.tokens.length;
      return { pass: n > 0, detail: `tokenNodes=${n}` };
    },
  },
  {
    id: "C2",
    title: "component extraction produces named component nodes",
    check({ graph }) {
      const n = graph.components.length;
      return { pass: n > 0, detail: `componentNodes=${n}` };
    },
  },
  {
    id: "H2",
    title: "self-DS is flagged; a consumer app is not",
    check({ result }, repo) {
      const flagged = result.meta?.dsSelfMode === true;
      if (repo.dimensions.includes("consumer")) {
        return { pass: !flagged, detail: `dsSelfMode=${flagged} (expected false — consumer)` };
      }
      return { pass: flagged, detail: `dsSelfMode=${flagged} (expected true — self-DS)` };
    },
  },
  {
    id: "H3",
    title: "SFC sources parse (no parse errors on framework files)",
    check({ result }, repo) {
      const exts = repo.dimensions
        .map((d) => FRAMEWORK_EXT[d])
        .filter((e): e is string => Boolean(e));
      const errs = result.meta?.coverage?.parseErrors ?? [];
      const offending = errs.filter((e) => exts.some((ext) => e.file.endsWith(ext)));
      return {
        pass: offending.length === 0,
        detail: `${offending.length} parse error(s) on ${exts.join("/") || "framework"} files (parseErrors total=${errs.length})`,
      };
    },
  },
];
