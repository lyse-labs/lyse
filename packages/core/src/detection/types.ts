type DetectionConfidence = "high" | "medium" | "low";

export interface DetectionResult<T> {
  value: T | null;
  confidence: DetectionConfidence;
  source: string;
}

export interface Detected {
  framework: DetectionResult<"react" | "vue" | "svelte" | "solid" | "unknown">;
  hasTypeScript: DetectionResult<boolean>;
  componentsModule: ComponentsModuleDetection;
  storybook: DetectionResult<boolean>;
  packageManager: DetectionResult<"npm" | "pnpm" | "yarn" | "bun">;
  cursor: DetectionResult<boolean>;
  claudeCode: DetectionResult<boolean>;
  git: DetectionResult<{
    initialized: boolean;
    hasRemote: boolean;
    isClean: boolean;
    branch: string | null;
    defaultBranch: string | null;
  }>;
  github: DetectionResult<{ owner: string; repo: string }>;
}

/** A package owned by this monorepo's workspace globs. */
export interface WorkspacePackage {
  name: string;
  /** Repo-relative, `/`-separated directory holding this package's package.json. `""` for the root package. */
  relDir: string;
  private: boolean;
  /** package.json declares `exports`, `main` or `module`. */
  hasPublicEntry: boolean;
}

/** A workspace package that belongs to the repo's design system. */
export interface DsFamilyMember {
  name: string;
  relDir: string;
}

export interface ComponentsModuleDetection extends DetectionResult<string> {
  /**
   * True when the repo IS the design system (the module was resolved from its
   * own workspace packages). Replaces matching on `source` text, which silently
   * coupled ds-self mode to a human-readable string.
   */
  dsSelf: boolean;
  /** Sorted DS family this module belongs to. Empty unless `dsSelf`. */
  family: DsFamilyMember[];
}
