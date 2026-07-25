import type { TokenAxis } from "../../graph/types.js";

export interface RecallFixture {
  id: string;
  ruleId: string;
  axis: TokenAxis;
  files: { path: string; content: string }[];
  componentPath: string;
  marker: string;
  lyseYaml: string;
}

// componentsModule just needs to be set to skip auto-detection (which is the
// only way dsSelfMode can become true) — its value is never resolved against
// a real package here, so any non-empty string that isn't this fixture's own
// path keeps dsSelfMode false and zones the component "app".
const APP_ZONED_LYSE_YAML = 'designSystem:\n  componentsModule: "@acme/design-system"\n';

// 4 hue families × 10 shades = 40 non-trivial DTCG color tokens. None equal
// pure white/black/transparent, so the exact-class resolver bucket (Task 2)
// can reach N ≥ 35 without trivial-suppression eating the sample.
const COLOR_TOKENS_JSON = `{
  "color": {
    "brand": {
      "50": { "$value": "#eff6ff", "$type": "color" },
      "100": { "$value": "#dbeafe", "$type": "color" },
      "200": { "$value": "#bfdbfe", "$type": "color" },
      "300": { "$value": "#93c5fd", "$type": "color" },
      "400": { "$value": "#60a5fa", "$type": "color" },
      "500": { "$value": "#3b82f6", "$type": "color" },
      "600": { "$value": "#2563eb", "$type": "color" },
      "700": { "$value": "#1d4ed8", "$type": "color" },
      "800": { "$value": "#1e40af", "$type": "color" },
      "900": { "$value": "#1e3a8a", "$type": "color" }
    },
    "accent": {
      "50": { "$value": "#f5f3ff", "$type": "color" },
      "100": { "$value": "#ede9fe", "$type": "color" },
      "200": { "$value": "#ddd6fe", "$type": "color" },
      "300": { "$value": "#c4b5fd", "$type": "color" },
      "400": { "$value": "#a78bfa", "$type": "color" },
      "500": { "$value": "#8b5cf6", "$type": "color" },
      "600": { "$value": "#7c3aed", "$type": "color" },
      "700": { "$value": "#6d28d9", "$type": "color" },
      "800": { "$value": "#5b21b6", "$type": "color" },
      "900": { "$value": "#4c1d95", "$type": "color" }
    },
    "success": {
      "50": { "$value": "#ecfdf5", "$type": "color" },
      "100": { "$value": "#d1fae5", "$type": "color" },
      "200": { "$value": "#a7f3d0", "$type": "color" },
      "300": { "$value": "#6ee7b7", "$type": "color" },
      "400": { "$value": "#34d399", "$type": "color" },
      "500": { "$value": "#10b981", "$type": "color" },
      "600": { "$value": "#059669", "$type": "color" },
      "700": { "$value": "#047857", "$type": "color" },
      "800": { "$value": "#065f46", "$type": "color" },
      "900": { "$value": "#064e3b", "$type": "color" }
    },
    "danger": {
      "50": { "$value": "#fef2f2", "$type": "color" },
      "100": { "$value": "#fee2e2", "$type": "color" },
      "200": { "$value": "#fecaca", "$type": "color" },
      "300": { "$value": "#fca5a5", "$type": "color" },
      "400": { "$value": "#f87171", "$type": "color" },
      "500": { "$value": "#ef4444", "$type": "color" },
      "600": { "$value": "#dc2626", "$type": "color" },
      "700": { "$value": "#b91c1c", "$type": "color" },
      "800": { "$value": "#991b1b", "$type": "color" },
      "900": { "$value": "#7f1d1d", "$type": "color" }
    }
  }
}
`;

// 40 DTCG dimension tokens on a realistic px scale (2..138). Paths carry no
// "radius"/"border-width"/"breakpoint"/"z-index"/"opacity" segment, so
// dimensionAxisForPath's default routes every one of them to "spacing".
const SPACING_TOKENS_JSON = `{
  "space": {
    "step-01": { "$value": "2px", "$type": "dimension" },
    "step-02": { "$value": "4px", "$type": "dimension" },
    "step-03": { "$value": "6px", "$type": "dimension" },
    "step-04": { "$value": "8px", "$type": "dimension" },
    "step-05": { "$value": "10px", "$type": "dimension" },
    "step-06": { "$value": "12px", "$type": "dimension" },
    "step-07": { "$value": "14px", "$type": "dimension" },
    "step-08": { "$value": "16px", "$type": "dimension" },
    "step-09": { "$value": "18px", "$type": "dimension" },
    "step-10": { "$value": "20px", "$type": "dimension" },
    "step-11": { "$value": "22px", "$type": "dimension" },
    "step-12": { "$value": "26px", "$type": "dimension" },
    "step-13": { "$value": "30px", "$type": "dimension" },
    "step-14": { "$value": "34px", "$type": "dimension" },
    "step-15": { "$value": "38px", "$type": "dimension" },
    "step-16": { "$value": "42px", "$type": "dimension" },
    "step-17": { "$value": "46px", "$type": "dimension" },
    "step-18": { "$value": "50px", "$type": "dimension" },
    "step-19": { "$value": "54px", "$type": "dimension" },
    "step-20": { "$value": "58px", "$type": "dimension" },
    "step-21": { "$value": "62px", "$type": "dimension" },
    "step-22": { "$value": "66px", "$type": "dimension" },
    "step-23": { "$value": "70px", "$type": "dimension" },
    "step-24": { "$value": "74px", "$type": "dimension" },
    "step-25": { "$value": "78px", "$type": "dimension" },
    "step-26": { "$value": "82px", "$type": "dimension" },
    "step-27": { "$value": "86px", "$type": "dimension" },
    "step-28": { "$value": "90px", "$type": "dimension" },
    "step-29": { "$value": "94px", "$type": "dimension" },
    "step-30": { "$value": "98px", "$type": "dimension" },
    "step-31": { "$value": "102px", "$type": "dimension" },
    "step-32": { "$value": "106px", "$type": "dimension" },
    "step-33": { "$value": "110px", "$type": "dimension" },
    "step-34": { "$value": "114px", "$type": "dimension" },
    "step-35": { "$value": "118px", "$type": "dimension" },
    "step-36": { "$value": "122px", "$type": "dimension" },
    "step-37": { "$value": "126px", "$type": "dimension" },
    "step-38": { "$value": "130px", "$type": "dimension" },
    "step-39": { "$value": "134px", "$type": "dimension" },
    "step-40": { "$value": "138px", "$type": "dimension" }
  }
}
`;

const COLOR_COMPONENT_PATH = "src/components/Card.css";
const COLOR_MARKER = "/*DRIFT*/var(--color-brand-500)";
const COLOR_COMPONENT_CSS = `.card {
  display: flex;
  padding: 16px;
  color: ${COLOR_MARKER};
  background-color: var(--color-brand-50);
  border-color: var(--color-accent-300);
}
`;

const SPACING_COMPONENT_PATH = "src/components/Panel.css";
const SPACING_MARKER = "/*DRIFT*/var(--space-4)";
const SPACING_COMPONENT_CSS = `.panel {
  display: block;
  padding: ${SPACING_MARKER};
  margin-top: var(--space-8);
  gap: var(--space-2);
}
`;

export const RECALL_FIXTURES: RecallFixture[] = [
  {
    id: "color-app",
    ruleId: "tokens/no-hardcoded-color",
    axis: "colors",
    files: [
      { path: "tokens/color.tokens.json", content: COLOR_TOKENS_JSON },
      { path: COLOR_COMPONENT_PATH, content: COLOR_COMPONENT_CSS },
    ],
    componentPath: COLOR_COMPONENT_PATH,
    marker: COLOR_MARKER,
    lyseYaml: APP_ZONED_LYSE_YAML,
  },
  {
    id: "spacing-app",
    ruleId: "tokens/no-hardcoded-spacing",
    axis: "spacing",
    files: [
      { path: "tokens/space.tokens.json", content: SPACING_TOKENS_JSON },
      { path: SPACING_COMPONENT_PATH, content: SPACING_COMPONENT_CSS },
    ],
    componentPath: SPACING_COMPONENT_PATH,
    marker: SPACING_MARKER,
    lyseYaml: APP_ZONED_LYSE_YAML,
  },
];
