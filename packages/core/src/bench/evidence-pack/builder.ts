import type { EvidencePack, RepoMeta } from "./types.js";
import { detectManifests } from "./manifest-detector.js";
import { computeIsLikelyDummy } from "./anti-dummy.js";
import { buildPackageJsonDigest } from "./package-json-digest.js";
import { computeHistograms } from "./histograms.js";
import { collectCanonicalSamples } from "./sampler.js";
import { buildVerifierCorpus } from "./verifier-corpus.js";

export interface BuildEvidencePackInput {
  repoRoot: string;
  owner: string;
  name: string;
  headSha: string;
  lyseCliVersion: string;
  extractedAt: string;
  primaryLanguage?: string;
  frameworks?: ReadonlyArray<string>;
  monorepoLayout?: RepoMeta["monorepoLayout"];
  knownDummyHashes?: ReadonlySet<string>;
}

export async function buildEvidencePack(input: BuildEvidencePackInput): Promise<EvidencePack> {
  const manifests = await detectManifests(input.repoRoot);
  const knownDummyHashes = input.knownDummyHashes ?? new Set<string>();
  const enrichDummy = async (meta: typeof manifests.agentsMd): Promise<typeof manifests.agentsMd> => {
    if (!meta.present || !meta.path || !meta.sha256) return meta;
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const content = await readFile(join(input.repoRoot, meta.path), "utf8");
      const isLikelyDummy = computeIsLikelyDummy({
        size: meta.size ?? 0,
        lineCount: meta.lineCount ?? 0,
        content,
        sha256: meta.sha256,
        knownDummyHashes,
      });
      return { ...meta, isLikelyDummy };
    } catch {
      return meta;
    }
  };
  const enrichedManifests = {
    ...manifests,
    agentsMd: await enrichDummy(manifests.agentsMd),
    claudeMd: await enrichDummy(manifests.claudeMd),
    designMd: await enrichDummy(manifests.designMd),
    skillMd: await enrichDummy(manifests.skillMd),
    componentsJson: await enrichDummy(manifests.componentsJson),
    llmsTxt: await enrichDummy(manifests.llmsTxt),
    llmsFullTxt: await enrichDummy(manifests.llmsFullTxt),
    tokensJsonDtcg: await enrichDummy(manifests.tokensJsonDtcg),
  };

  const packageJsonDigest = await buildPackageJsonDigest(input.repoRoot);
  const histograms = await computeHistograms(input.repoRoot);
  const canonicalSamples = await collectCanonicalSamples(input.repoRoot);

  const allSamples = [
    ...canonicalSamples.primitiveComponents,
    ...canonicalSamples.compoundComponents,
    ...canonicalSamples.layoutComponents,
    ...canonicalSamples.formComponents,
    ...canonicalSamples.stories,
    ...canonicalSamples.tests,
    ...canonicalSamples.tokenFiles,
    ...canonicalSamples.configFiles,
  ];
  const verifierCorpus = buildVerifierCorpus({ files: allSamples });

  const repo: RepoMeta = {
    owner: input.owner,
    name: input.name,
    headSha: input.headSha,
    primaryLanguage: input.primaryLanguage ?? "TypeScript",
    frameworks: input.frameworks ?? [],
    monorepoLayout: input.monorepoLayout ?? "unknown",
    subpackages: packageJsonDigest.subpackages.map((p) => p.path).sort(),
  };

  const pack: EvidencePack = {
    canonicalSamples,
    extractedAt: input.extractedAt,
    histograms,
    lyseCliVersion: input.lyseCliVersion,
    manifests: enrichedManifests,
    packageJsonDigest,
    repo,
    schemaVersion: "bench-pack/1.0",
    verifierCorpus,
  };
  return pack;
}
