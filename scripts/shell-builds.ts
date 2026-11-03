// Which site-shell builds stay in shell/public/_site/.
//
// `released` is the committed shell/generated/builds.txt (newest last): the
// builds that have shipped, or will with this commit. A new build is appended to
// that list, not to the working copy, so local rebuilds before a commit only
// replace each other and never push a released build out.
export function keptBuilds(released: readonly string[], id: string, keep: number): string[] {
  const order = released.at(-1) === id ? [...released] : [...released.filter((b) => b !== id), id];
  return order.slice(-keep);
}

export function parseBuilds(text: string): string[] {
  return text.split('\n').filter(Boolean);
}
