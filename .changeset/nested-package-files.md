---
"@lyse-labs/lyse": patch
---

A file inside a nested package is no longer counted as its parent package's source.

`vitejs/vite` was reported as a design system because `create-vite` holds 24 component-shaped files — every one a project template it copies into new repositories. Each template carries its own `package.json`, so those files belong to a package that is not a workspace member and should count for nobody.

A `package.json` strictly between the owning package's directory and the file now ends the attribution. Structural, not a name match: it rules out scaffolding templates, vendored copies and example projects at once.

Measured on both corpora: the 26-repo positive corpus is unchanged, every verdict identical; the negative corpus goes from 3 false positives of 4 to 2.
