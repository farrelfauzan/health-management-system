import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FEATURE_CATALOG, FEATURE_KEYS, isFeatureKey } from '@hms/shared-types';

/**
 * IMP-6 — structural proof that the three places a feature key exists agree:
 * `FEATURE_CATALOG` (the definition), `seed.sql` (the rows), and the RBAC
 * permission pair that guards them.
 *
 * SQL cannot import TypeScript, so the seed necessarily repeats the key list.
 * This spec is what makes that repetition safe: adding a catalog key without
 * seeding it, or seeding a key nothing implements, fails here rather than in
 * a clinic that finds a feature it bought switched off.
 */
describe('Feature catalog', () => {
  const seedSql = readFileSync(join(__dirname, '../../../prisma/seed.sql'), 'utf8');

  function readSeededFeatureKeys(): string[] {
    const block = /AS seed_feature_entitlements\(feature_key\)/.exec(seedSql);
    expect(block).not.toBeNull();
    const insertStart = seedSql.lastIndexOf('INSERT INTO "feature_entitlements"');
    expect(insertStart).toBeGreaterThan(-1);
    const insertBlock = seedSql.slice(insertStart, block?.index);
    return Array.from(insertBlock.matchAll(/\('([a-z0-9-]+)'\)/g), (match) => match[1] ?? '');
  }

  it('gives every entry a kebab-case key, a name, and a description', () => {
    for (const entry of FEATURE_CATALOG) {
      expect(entry.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it('seeds exactly the catalog keys, no more and no fewer', () => {
    expect(readSeededFeatureKeys().sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it('seeds the read and manage permissions the admin endpoints require', () => {
    expect(seedSql).toContain("('feature.read:any', 'FeatureEntitlement', 'read', 'ANY'");
    expect(seedSql).toContain("('feature.manage:any', 'FeatureEntitlement', 'manage', 'ANY'");
  });

  it('never claims a nav route the platform core owns', () => {
    // Switching a feature off must not be able to hide the way back in.
    const coreRoutes = ['/admin/dashboard', '/admin/administration', '/login'];
    const claimed = FEATURE_CATALOG.flatMap((entry) => entry.navHrefs);
    for (const route of coreRoutes) {
      expect(claimed).not.toContain(route);
    }
  });

  it('narrows only keys that exist', () => {
    expect(isFeatureKey('ai-chatbot')).toBe(true);
    expect(isFeatureKey('patients')).toBe(false);
  });
});
