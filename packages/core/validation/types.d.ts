export type OracleKind = "construction" | "metamorphic" | "cross-tool" | "execution";
export type FixtureFiles = Record<string, string>;
/**
 * A mutation operator transforms a clean fixture into one that contains
 * exactly one KNOWN violation of the target rule. The label is the operator
 * itself — no model judges it.
 */
export interface MutationOperator {
    name: string;
    apply: (clean: FixtureFiles) => FixtureFiles;
}
/**
 * Two fixtures that are semantically equivalent w.r.t. the rule and MUST
 * therefore receive the same verdict. A disagreement is a Lyse inconsistency.
 */
export interface MetamorphicPair {
    name: string;
    a: FixtureFiles;
    b: FixtureFiles;
    /** Expected shared verdict: true = both should flag, false = neither should. */
    expectViolation: boolean;
}
export interface OracleAdapter {
    ruleId: string;
    oracleKind: OracleKind;
    cleanFixture: () => FixtureFiles;
    mutations: MutationOperator[];
    metamorphic: MetamorphicPair[];
    /**
     * Labelled NEGATIVE fixtures — realistic code that resembles a violation but
     * is legitimate (token definitions, doc/example blocks, var() fallbacks…).
     * Each MUST NOT flag; each adds one negative observation to the matrix.
     * Harvested from real OSS code, not invented — this is what makes the
     * derived precision track reality.
     */
    falseFriends?: FixtureFiles[];
}
export interface ConfusionMatrix {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
}
export interface MetamorphicInconsistency {
    pair: string;
    expectViolation: boolean;
    aFlagged: boolean;
    bFlagged: boolean;
}
export interface RuleScore {
    ruleId: string;
    oracleKind: OracleKind;
    matrix: ConfusionMatrix;
    youdensJ: number;
    metamorphicInconsistencies: MetamorphicInconsistency[];
    mutationsRun: number;
}
export interface EngineReport {
    lyseVersion: string;
    scores: RuleScore[];
}
