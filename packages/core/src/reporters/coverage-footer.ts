import type { CoverageMeta } from "../types.js";

export function formatCoverageFooter(coverage: CoverageMeta): string {
  const count = coverage.scannedFiles.toLocaleString("en-US");
  const noun = coverage.scannedFiles === 1 ? "file" : "files";
  const seconds = (coverage.durationMs / 1000).toFixed(1);
  return `Scanned: ${count} ${noun} in ${seconds}s.`;
}
