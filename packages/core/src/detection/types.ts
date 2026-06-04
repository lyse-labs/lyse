type DetectionConfidence = "high" | "medium" | "low";

export interface DetectionResult<T> {
  value: T | null;
  confidence: DetectionConfidence;
  source: string;
}

export interface Detected {
  framework: DetectionResult<"react" | "vue" | "svelte" | "solid" | "unknown">;
  hasTypeScript: DetectionResult<boolean>;
  componentsModule: DetectionResult<string>;
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
