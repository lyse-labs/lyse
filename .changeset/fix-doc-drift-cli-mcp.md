---
"@lyse-labs/lyse": patch
---

Fix doc drift in the CLI/MCP surface: the `lyse audit` reference now documents the `--render`, `--storybook`, `--llm`/`--no-llm`, `--llm-provider`, `--llm-model`, and `--include-timestamps` flags (previously omitted); the MCP `suggest_fix` auto-fixable list — both the in-tool description and the docs — now correctly lists the four rules it can actually patch (`tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`, `components/no-native-shadows`, `ai-governance/ai-token-requires-marker`) instead of two naming rules it can't and omitting the AI-token one; `lyse fix` is documented as auto-fixing 6 rules (not 5); and the `lyse agents-md` deprecation warning no longer claims the alias was "removed in v0.2" while it still ships.
