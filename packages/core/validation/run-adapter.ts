import { ruleFlagged } from "./audit-probe.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type {
  OracleAdapter,
  RuleScore,
  FixtureFiles,
  MetamorphicInconsistency,
  ConfusionMatrix,
} from "./types.js";

export type Probe = (files: FixtureFiles, ruleId: string) => Promise<boolean>;

export async function evaluateAdapter(
  adapter: OracleAdapter,
  probe: Probe = ruleFlagged,
): Promise<RuleScore> {
  let matrix: ConfusionMatrix = emptyMatrix();

  // Negative observation: the clean fixture must NOT flag.
  const clean = adapter.cleanFixture();
  matrix = addObservation(matrix, false, await probe(clean, adapter.ruleId));

  // Negative observations: each false-friend must NOT flag.
  for (const friend of adapter.falseFriends ?? []) {
    matrix = addObservation(matrix, false, await probe(friend, adapter.ruleId));
  }

  // Positive observations: each mutation injects a known violation that MUST flag.
  for (const mutation of adapter.mutations) {
    const mutated = mutation.apply(adapter.cleanFixture());
    matrix = addObservation(matrix, true, await probe(mutated, adapter.ruleId));
  }

  const metamorphicInconsistencies: MetamorphicInconsistency[] = [];
  for (const pair of adapter.metamorphic) {
    const aFlagged = await probe(pair.a, adapter.ruleId);
    const bFlagged = await probe(pair.b, adapter.ruleId);
    const consistent = aFlagged === pair.expectViolation && bFlagged === pair.expectViolation;
    if (!consistent) {
      metamorphicInconsistencies.push({
        pair: pair.name,
        expectViolation: pair.expectViolation,
        aFlagged,
        bFlagged,
      });
    }
  }

  return {
    ruleId: adapter.ruleId,
    oracleKind: adapter.oracleKind,
    matrix,
    youdensJ: youdensJ(matrix),
    metamorphicInconsistencies,
    mutationsRun: adapter.mutations.length,
  };
}
