# Fixture: explainability coverage — positive

The well-behaved counterpart to the negative fixture.

Every AI-output render site carries a reachable explainability indicator:
`AILabel` is wired via `aria-describedby` to an `ExplainPopover` whose
content is layered What → Why → How, and `SuggestionCard` composes both at
the same render site.

Expected: behavioral dimension `explainability-coverage-behavioral` raises
no flag.
