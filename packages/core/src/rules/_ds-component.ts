import type { SourceFile } from "ts-morph";

export interface DsComponentContext {
  componentsModule: string | null;
  componentInventory: Array<{ name: string; module: string }>;
}

/**
 * Determines whether a JSX tag is a design-system component.
 *
 * Returns true iff:
 * - `tagName` is PascalCase (starts with uppercase letter), AND
 * - EITHER:
 *   - `tagName` is in `ctx.componentInventory` by name, OR
 *   - `sourceFile` has an import from `ctx.componentsModule` that includes `tagName`
 *
 * Lowercase tags (raw HTML) always return false.
 * Local PascalCase components not from the DS return false.
 */
export function isDsComponent(
  tagName: string,
  sourceFile: SourceFile,
  ctx: DsComponentContext
): boolean {
  // Lowercase tags are raw HTML, not components.
  if (!/^[A-Z]/.test(tagName)) {
    return false;
  }

  // Check if the tag is in the component inventory.
  if (ctx.componentInventory.some((entry) => entry.name === tagName)) {
    return true;
  }

  // If no componentsModule is set, we can't check imports.
  if (ctx.componentsModule === null) {
    return false;
  }

  // Check if the tag is imported from the components module.
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    if (imp.getModuleSpecifierValue() === ctx.componentsModule) {
      // Check named imports.
      const namedImports = imp.getNamedImports();
      if (namedImports.some((n) => n.getName() === tagName)) {
        return true;
      }

      // Check default import.
      const defaultImport = imp.getDefaultImport();
      if (defaultImport?.getText() === tagName) {
        return true;
      }
    }
  }

  return false;
}
