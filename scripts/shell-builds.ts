// Which site-shell builds stay in shell/public/_site/.
//
// Only main deploys, so the release history is shell/generated/builds.txt as
// main has it (newest last). A build appends its own id to that list, so builds
// made on a branch, committed or not, only replace each other and never take a
// slot from, or push out, a deployed build.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function keptBuilds(released: readonly string[], id: string, keep: number): string[] {
  const order = released.at(-1) === id ? [...released] : [...released.filter((b) => b !== id), id];
  return order.slice(-keep);
}

export function parseBuilds(text: string): string[] {
  return text.split('\n').filter(Boolean);
}

const git = (repo: string, args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * `file` (repo-relative) at the merge-base of HEAD and origin/main, else at
 * origin/main; empty when main has no such file yet. Without an origin/main (a
 * shallow pull-request checkout) `file` as committed at HEAD, and the working
 * copy only when it is not committed yet.
 */
export function releasedBuilds(repo: string, file: string): string[] {
  let base: string;
  try {
    base = git(repo, ['merge-base', 'HEAD', 'origin/main']);
  } catch {
    try {
      base = git(repo, ['rev-parse', '--verify', 'origin/main^{commit}']);
    } catch {
      try {
        return parseBuilds(git(repo, ['show', `HEAD:${file}`]));
      } catch {
        const working = join(repo, file);
        return existsSync(working) ? parseBuilds(readFileSync(working, 'utf8')) : [];
      }
    }
  }
  try {
    return parseBuilds(git(repo, ['show', `${base}:${file}`]));
  } catch {
    return [];
  }
}
