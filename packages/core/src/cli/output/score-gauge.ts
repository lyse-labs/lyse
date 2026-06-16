export interface RenderScoreGaugeOpts {
  toolVersion?: string;
  /** A/B/C/Fail letter grade (Track #87); appended when present. */
  grade?: { grade: string; autoFailed: boolean };
}

export function renderScoreGauge(
  score: number | "N/A",
  scoringVersion: string,
  counted: number,
  experimental: number,
  opts?: RenderScoreGaugeOpts,
): string {
  const scoreText = score === "N/A" ? "N/A" : `${score} / 100`;
  const sep = "─".repeat(60);
  const versionSuffix = opts?.toolVersion ? `  ·  lyse ${opts.toolVersion}` : "";
  const gradeSuffix =
    opts?.grade && opts.grade.grade !== "N/A"
      ? `  ·  Grade ${opts.grade.grade}${opts.grade.autoFailed ? " (auto-fail)" : ""}`
      : "";
  const countedLine =
    experimental > 0
      ? `${counted} stable findings  ·  ${experimental} experimental (not counted)`
      : `${counted} findings counted in score`;
  return [
    sep,
    `Health Score: ${scoreText}  ·  ${scoringVersion}${gradeSuffix}${versionSuffix}`,
    countedLine,
    "",
  ].join("\n");
}
