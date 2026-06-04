// packages/core/src/rules/templates/registry.ts
import type { RuleTemplate } from './types.js';
import { jsPropTokenComplianceTemplate } from './js-prop-token-compliance.js';
import { jsCallTokenComplianceTemplate } from './js-call-token-compliance.js';
import { cssPropertyTokenComplianceTemplate } from './css-property-token-compliance.js';
import { tailwindUtilityClassComplianceTemplate } from './tailwind-utility-class-compliance.js';
import { importSourceRestrictionTemplate } from './import-source-restriction.js';
import { namingConventionTemplate } from './naming-convention.js';
import { storybookCoverageTemplate } from './storybook-coverage-template.js';
import { a11yJsxTemplate } from './a11y-jsx-template.js';

export const TEMPLATE_CATALOG_VERSION = 1;

const TEMPLATES: ReadonlyArray<RuleTemplate> = [
  jsPropTokenComplianceTemplate as RuleTemplate,
  jsCallTokenComplianceTemplate as RuleTemplate,
  cssPropertyTokenComplianceTemplate as RuleTemplate,
  tailwindUtilityClassComplianceTemplate as RuleTemplate,
  importSourceRestrictionTemplate as RuleTemplate,
  namingConventionTemplate as RuleTemplate,
  storybookCoverageTemplate as RuleTemplate,
  a11yJsxTemplate as RuleTemplate,
];

const BY_NAME = new Map<string, RuleTemplate>(TEMPLATES.map((t) => [t.name, t]));

export function getTemplate(name: string): RuleTemplate | undefined {
  return BY_NAME.get(name);
}

export function listTemplates(): ReadonlyArray<RuleTemplate> {
  return TEMPLATES;
}

export function templateCatalogDescriptions(): string {
  return TEMPLATES.map((t) => `- ${t.name}: ${t.description}`).join('\n');
}
