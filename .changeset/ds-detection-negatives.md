---
"@lyse-labs/lyse": patch
---

A negative corpus for design-system detection, and the first precision measurement it has ever had.

Every corpus in this repo is made of design systems, so precision on them was computed with no way to be wrong — a detector answering "yes" for every repository on earth would score perfectly. `pnpm measure:ds-precision` runs detection against four repositories where the correct answer is **no**, chosen for the shape that fools it: a private workspace monorepo whose packages hold real `.tsx`.

Three of the four are false positives today. `usebruno/bruno` (an API client) → `@usebruno/sqlite`, on one file. `vitejs/vite` (a build tool) → `create-vite`, on 24 project *templates*. `nrwl/nx` (a build system) → `@nx/nx-dev-ui-icons`, its docs site's icons. Reported, not gated: a check red on every run is a check nobody reads.

No behaviour change — this measures what already shipped.
