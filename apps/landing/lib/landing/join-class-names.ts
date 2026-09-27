/** Joins the truthy class names with a space; falsy entries are dropped. */
export function joinClassNames(
  ...classNames: readonly (string | false | null | undefined)[]
): string {
  return classNames.filter(Boolean).join(' ');
}
