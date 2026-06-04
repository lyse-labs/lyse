const SEVERITY_WEIGHT: Record<string, number> = { error: 4, warning: 2, info: 1 };

export function findingWeight(severity: string, axisConfidence: number): number {
  return (SEVERITY_WEIGHT[severity] ?? 1) * axisConfidence;
}
