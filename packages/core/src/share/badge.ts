export type BadgeGrade = "A" | "B" | "C" | "Fail" | "N/A";

export interface BadgeInput {
  score: number | "N/A";
  grade: BadgeGrade;
  repoUrl: string | null;
}

interface BadgeEndpointJson {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

export interface BadgeOutput {
  endpointJson: BadgeEndpointJson;
  staticUrl: string;
  staticMarkdown: string;
  endpointMarkdown: (rawJsonUrl: string) => string;
}

const COLOR: Record<BadgeGrade, string> = {
  A: "brightgreen",
  B: "green",
  C: "yellow",
  Fail: "red",
  "N/A": "lightgrey",
};
const LABEL = "Lyse";

// shields.io static-badge path encoding: '-'→'--', '_'→'__', ' '→'_', then
// percent-encode the remainder (so '/' → %2F). '(' and ')' are URL-safe and
// left as-is by encodeURIComponent.
function shieldsEncode(s: string): string {
  return encodeURIComponent(s.replace(/-/g, "--").replace(/_/g, "__").replace(/ /g, "_"));
}

export function buildBadge(input: BadgeInput): BadgeOutput {
  const message = input.score === "N/A" ? "N/A" : `${input.score}/100 (${input.grade})`;
  const color = COLOR[input.grade];
  const endpointJson: BadgeEndpointJson = { schemaVersion: 1, label: LABEL, message, color };

  const staticUrl = `https://img.shields.io/badge/${shieldsEncode(LABEL)}-${shieldsEncode(message)}-${color}`;

  const wrap = (img: string): string => (input.repoUrl ? `[${img}](${input.repoUrl})` : img);

  const staticMarkdown = wrap(`![Lyse Health Score](${staticUrl})`);
  const endpointMarkdown = (rawJsonUrl: string): string =>
    wrap(`![Lyse Health Score](https://img.shields.io/endpoint?url=${encodeURIComponent(rawJsonUrl)})`);

  return { endpointJson, staticUrl, staticMarkdown, endpointMarkdown };
}
