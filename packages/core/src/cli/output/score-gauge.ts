export interface RenderScoreGaugeOpts {
  toolVersion?: string;
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
  const countedLine =
    experimental > 0
      ? `${counted} stable findings  ·  ${experimental} experimental (not counted)`
      : `${counted} findings counted in score`;
  return [
    sep,
    `Health Score: ${scoreText}  ·  ${scoringVersion}${versionSuffix}`,
    countedLine,
    "",
  ].join("\n");
}
