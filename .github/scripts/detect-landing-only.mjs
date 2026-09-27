#!/usr/bin/env node
// Decides whether a pull request only touches the marketing site, so CI can
// skip the Postgres, Prisma, integration and Docker work that cannot be
// affected by it. Prints `landing_only=true|false` to $GITHUB_OUTPUT (or
// stdout) and explains the decision on stderr.
//
// Fail-safe by construction: every path that is not positively proven to be
// landing-only answers `false`, and a crash leaves the output unset, which the
// workflow reads as `false` too.
//
// Usage: node detect-landing-only.mjs <base-sha> <head-sha>
//
// The lockfile is the subtle case. A landing dependency bump rewrites
// `pnpm-lock.yaml`, but so does a bump that shifts a transitive version the
// API or web app resolves. So a lockfile change only counts as landing-only
// when every other importer resolves exactly the same package snapshots, and
// the lockfile's global sections (overrides, settings, patches) are unchanged.
// Parsing uses `yq`, which the GitHub-hosted Ubuntu image ships.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

const LANDING_DIR = 'apps/landing';
const LOCKFILE = 'pnpm-lock.yaml';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const LOCKFILE_GRAPH_SECTIONS = new Set(['importers', 'packages', 'snapshots']);

function isAllowedPath(file) {
  return (
    file.startsWith(`${LANDING_DIR}/`) ||
    file === LOCKFILE ||
    file.startsWith('docs/') ||
    // Root-level Markdown only: nested .md files may be read at runtime.
    (!file.includes('/') && file.endsWith('.md'))
  );
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function listChangedFiles(base, head) {
  // `--no-renames`: a move out of apps/api into apps/landing must list both
  // sides, or the deletion would hide behind the new path.
  return git(['diff', '--name-only', '--no-renames', `${base}...${head}`])
    .split('\n')
    .filter(Boolean);
}

function readLockfile(ref) {
  const yaml = git(['show', `${ref}:${LOCKFILE}`]);
  return JSON.parse(execFileSync('yq', ['-o=json', '.'], { input: yaml, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
}

function stripPeerSuffix(key) {
  const index = key.indexOf('(', 1);
  return index === -1 ? key : key.slice(0, index);
}

// Resolves a dependency entry to its snapshot key, or null when the lockfile
// uses a form this script does not understand (which makes the caller bail).
function resolveSnapshotKey(lockfile, name, version) {
  const snapshots = lockfile.snapshots ?? {};
  if (`${name}@${version}` in snapshots) return `${name}@${version}`;
  // Aliased dependencies (`"foo": "npm:bar@1"`) record the target key itself.
  if (version in snapshots) return version;
  return null;
}

// Fingerprints everything an importer can see: its own manifest block, linked
// workspace importers, and the full transitive set of snapshots with their
// package metadata. Two equal fingerprints mean identical installs for it.
function fingerprintImporter(lockfile, importerPath) {
  const seen = new Map();
  const visitedImporters = new Set();
  const queue = [];
  const enqueueDependencies = (dependencies, fromImporter) => {
    for (const [name, entry] of Object.entries(dependencies ?? {})) {
      const version = typeof entry === 'string' ? entry : entry.version;
      if (version.startsWith('link:')) {
        if (fromImporter === null) throw new Error(`link: dependency inside snapshot for ${name}`);
        visitImporter(path.posix.join(fromImporter, version.slice('link:'.length)));
        continue;
      }
      const key = resolveSnapshotKey(lockfile, name, version);
      if (key === null) throw new Error(`cannot resolve ${name}@${version}`);
      queue.push(key);
    }
  };
  const visitImporter = (importer) => {
    const normalised = importer === '' ? '.' : importer;
    if (visitedImporters.has(normalised)) return;
    visitedImporters.add(normalised);
    const block = lockfile.importers?.[normalised];
    if (block === undefined) throw new Error(`unknown importer ${normalised}`);
    seen.set(`importer:${normalised}`, JSON.stringify(block));
    for (const field of DEPENDENCY_FIELDS) enqueueDependencies(block[field], normalised);
  };
  visitImporter(importerPath);
  while (queue.length > 0) {
    const key = queue.pop();
    if (seen.has(key)) continue;
    const snapshot = lockfile.snapshots[key];
    const metadata = lockfile.packages?.[stripPeerSuffix(key)];
    seen.set(key, JSON.stringify([snapshot, metadata]));
    enqueueDependencies(snapshot.dependencies, null);
    enqueueDependencies(snapshot.optionalDependencies, null);
  }
  return JSON.stringify([...seen.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function explainLockfileDifference(baseLock, headLock) {
  const topLevelKeys = new Set([...Object.keys(baseLock), ...Object.keys(headLock)]);
  for (const key of topLevelKeys) {
    if (LOCKFILE_GRAPH_SECTIONS.has(key)) continue;
    if (JSON.stringify(baseLock[key]) !== JSON.stringify(headLock[key])) return `lockfile section "${key}" changed`;
  }
  const importers = new Set([...Object.keys(baseLock.importers ?? {}), ...Object.keys(headLock.importers ?? {})]);
  for (const importer of importers) {
    if (importer === LANDING_DIR) continue;
    if (!(importer in (baseLock.importers ?? {})) || !(importer in (headLock.importers ?? {}))) {
      return `importer ${importer} added or removed`;
    }
    if (fingerprintImporter(baseLock, importer) !== fingerprintImporter(headLock, importer)) {
      return `resolved dependencies of ${importer} changed`;
    }
  }
  return null;
}

function decide(base, head) {
  const files = listChangedFiles(base, head);
  if (files.length === 0) return { landingOnly: false, reason: 'no changed files detected' };
  const outside = files.filter((file) => !isAllowedPath(file));
  if (outside.length > 0) return { landingOnly: false, reason: `changes outside the landing allowlist: ${outside.slice(0, 10).join(', ')}` };
  if (!files.some((file) => file.startsWith(`${LANDING_DIR}/`))) {
    return { landingOnly: false, reason: `no change under ${LANDING_DIR}/` };
  }
  if (files.includes(LOCKFILE)) {
    const difference = explainLockfileDifference(readLockfile(base), readLockfile(head));
    if (difference !== null) return { landingOnly: false, reason: difference };
  }
  return { landingOnly: true, reason: `all ${files.length} changed file(s) are landing-scoped` };
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) throw new Error('usage: detect-landing-only.mjs <base-sha> <head-sha>');
  let decision;
  try {
    decision = decide(base, head);
  } catch (err) {
    decision = { landingOnly: false, reason: `detection failed, running everything: ${err.message}` };
  }
  const { landingOnly, reason } = decision;
  console.error(`landing_only=${landingOnly}: ${reason}`);
  const line = `landing_only=${landingOnly}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}

main();
