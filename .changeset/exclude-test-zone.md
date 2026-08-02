---
"@lyse-labs/lyse": patch
---

Test files no longer move the Health Score. 19% of findings on both held-out repositories landed in files Lyse's own zone classifier had already labelled `test` — and on primer-react the largest score-contributing penalty group, `components/svg-viewbox ×17`, was 15/17 inside test files, flagging `vi.fn(() => <svg aria-hidden="true" />)` mocks. The `test` zone is now excluded before the rules engine runs, so a rule's opportunities disappear together with its findings. Story files are deliberately still audited: a story is shipped documentation, and drift in a design system's own examples is real drift.
