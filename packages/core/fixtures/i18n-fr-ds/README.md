# Fixture: i18n French design system (Track 9.1)

A small French-language DS that exercises the localized AI-governance
detection end-to-end through the audit pipeline:

- `BadgeIA` — localized AI-marker component (structural word `badge` +
  FR noun `IA`) that opens Face B without any English marker name.
- `ResumeIA` — renders AI output with the FR disclaimer
  "Généré par l'IA. Vérifiez les résultats.", a `Régénérer` button and an
  `onRegenerate` handler prop.
- `AI_GOVERNANCE.md` — FR value-gate doc with gate phrasing and a checklist.

Expected: the `ai-governance` axis is ACTIVE (not N/A);
disclaimer-present, human-control-affordances and value-gate-doc-present
emit `info`; ai-marker-anti-patterns emits nothing. With
`i18n.locales: ["en"]` the same DS has no AI surface at all.
