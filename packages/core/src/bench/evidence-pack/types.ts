export interface ManifestPresence {
  present: boolean;
  path?: string;
  size?: number;
  sha256?: string;
  lineCount?: number;
  isLikelyDummy?: boolean;
}

export interface CursorRulesPresence extends ManifestPresence {
  directory?: string;
  fileCount?: number;
  files?: ReadonlyArray<{ path: string; size: number; sha256: string }>;
}

export interface McpConfigPresence extends ManifestPresence {
  transport?: "stdio" | "sse" | "streamable-http" | "unknown";
}

export interface ManifestsBlock {
  agentsMd: ManifestPresence;
  claudeMd: ManifestPresence;
  designMd: ManifestPresence;
  skillMd: ManifestPresence;
  componentsJson: ManifestPresence;
  cursorRules: CursorRulesPresence;
  llmsTxt: ManifestPresence;
  llmsFullTxt: ManifestPresence;
  mcpConfig: McpConfigPresence;
  tokensJsonDtcg: ManifestPresence;
}

export interface PackageJsonDigestEntry {
  path: string;
  name?: string;
  version?: string;
  scripts: ReadonlyArray<string>;
  deps: ReadonlyArray<string>;
  devDeps: ReadonlyArray<string>;
  exports: unknown;
}

export interface PackageJsonDigest {
  root: PackageJsonDigestEntry | null;
  subpackages: ReadonlyArray<PackageJsonDigestEntry>;
}

export interface Percentiles {
  p50: number;
  p90: number;
  p99: number;
}

export interface TokenDisciplineHistogram {
  filesScanned: number;
  inlineLiteralsPerFile: Percentiles;
  semanticTokenReferences: number;
  rawHexCount: number;
  rawRgbaCount: number;
  rawPxCount: number;
}

export interface A11yAttributesHistogram {
  ariaAttrCount: number;
  altAttrCount: number;
  roleAttrCount: number;
  tabIndexCount: number;
  focusManagementHookCount: number;
}

export interface StoryFilesHistogram {
  count: number;
  extensions: Readonly<Record<string, number>>;
  totalCharCount: number;
}

export interface TestFilesHistogram {
  count: number;
  extensions: Readonly<Record<string, number>>;
  framework: string | null;
}

export interface HistogramsBlock {
  tokenDiscipline: TokenDisciplineHistogram;
  a11yAttributes: A11yAttributesHistogram;
  storyFiles: StoryFilesHistogram;
  testFiles: TestFilesHistogram;
}

export interface CanonicalSample {
  path: string;
  sha256: string;
  byteCount: number;
  content: string;
}

export interface CanonicalSamplesBlock {
  primitiveComponents: ReadonlyArray<CanonicalSample>;
  compoundComponents: ReadonlyArray<CanonicalSample>;
  layoutComponents: ReadonlyArray<CanonicalSample>;
  formComponents: ReadonlyArray<CanonicalSample>;
  stories: ReadonlyArray<CanonicalSample>;
  tests: ReadonlyArray<CanonicalSample>;
  tokenFiles: ReadonlyArray<CanonicalSample>;
  configFiles: ReadonlyArray<CanonicalSample>;
}

export interface FileOffset {
  path: string;
  start: number;
  end: number;
}

export interface VerifierCorpus {
  totalBytes: number;
  fileOffsets: ReadonlyArray<FileOffset>;
  corpus: string;
}

export interface RepoMeta {
  owner: string;
  name: string;
  headSha: string;
  primaryLanguage: string;
  frameworks: ReadonlyArray<string>;
  monorepoLayout: "single-package" | "pnpm-workspace" | "yarn-workspace" | "lerna" | "nx" | "turbo" | "unknown";
  subpackages: ReadonlyArray<string>;
}

export interface EvidencePack {
  schemaVersion: "bench-pack/1.0";
  extractedAt: string;
  lyseCliVersion: string;
  repo: RepoMeta;
  manifests: ManifestsBlock;
  packageJsonDigest: PackageJsonDigest;
  histograms: HistogramsBlock;
  canonicalSamples: CanonicalSamplesBlock;
  verifierCorpus: VerifierCorpus;
}
