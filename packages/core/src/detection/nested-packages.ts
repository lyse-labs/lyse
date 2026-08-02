/**
 * Whether a component-shaped file is really part of the package that the
 * longest-prefix walk attributed it to.
 *
 * `vitejs/vite` was reported as a design system because `create-vite` holds 24
 * component-shaped files — every one of them a project TEMPLATE that
 * `create-vite` copies into new repositories. Each template carries its own
 * `package.json`, so those files are not create-vite's source at all; they
 * belong to a package that is not a workspace member, and should count for
 * nobody.
 *
 * The rule is structural, not a name match: a `package.json` strictly between
 * the owning package's directory and the file marks a boundary the attribution
 * walked straight past. It rules out scaffolding templates, vendored copies and
 * example projects in one stroke, without anyone maintaining a list of what
 * those directories tend to be called.
 */
export function fileBelongsToOwner(
  file: string,
  ownerRelDir: string,
  packageJsonPaths: ReadonlySet<string>,
): boolean {
  const prefix = ownerRelDir === "" ? "" : `${ownerRelDir}/`;
  if (ownerRelDir !== "" && !file.startsWith(prefix)) return false;

  const segments = file.slice(prefix.length).split("/");
  // Every intermediate directory between the owner and the file, excluding the
  // file itself — the owner's own package.json is at depth 0 and never counts.
  let dir = ownerRelDir;
  for (const segment of segments.slice(0, -1)) {
    dir = dir === "" ? segment : `${dir}/${segment}`;
    if (packageJsonPaths.has(`${dir}/package.json`)) return false;
  }
  return true;
}
