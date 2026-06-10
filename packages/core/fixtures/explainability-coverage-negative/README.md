# Fixture: explainability coverage — negative

Demonstrates the behavioral coverage gap that the static Track 3.5 rule
(`ai-governance/explainability-affordance`) misses.

An `ExplainPopover` component exists in the design system, so the static
presence check passes. But `SuggestionCard` renders an AI-marker label
(`AILabel`) with **no** explainability indicator reachable at that render
site. The behavioral grader dimension `explainability-coverage-behavioral`
flags this uncovered render site.

Expected: behavioral dimension flags a coverage gap; static rule does not.
