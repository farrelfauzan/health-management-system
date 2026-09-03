import { describe, expect, it } from 'vitest';

import enAuthShellMessages from '../messages/en/auth-shell.json';
import enClinicalMessages from '../messages/en/clinical.json';
import enDashboardAiMessages from '../messages/en/dashboard-ai.json';
import enMessages from '../messages/en.json';
import enOperationsMessages from '../messages/en/operations.json';
import enPharmacyInventoryMessages from '../messages/en/pharmacy-inventory.json';
import enSharedMessages from '../messages/en/shared.json';
// P16-T18. Its own catalog rather than a block in `dashboard-ai.json`,
// where the personal knowledge base lives. The two features hold the same
// file types and differ only in whether a document's passages reach an AI
// provider — filing the vault's copy beside the assistant's would be the
// exact confusion the epic exists to prevent.
import enVaultMessages from '../messages/en/vault.json';
import idAuthShellMessages from '../messages/id/auth-shell.json';
import idClinicalMessages from '../messages/id/clinical.json';
import idDashboardAiMessages from '../messages/id/dashboard-ai.json';
import idMessages from '../messages/id.json';
import idOperationsMessages from '../messages/id/operations.json';
import idPharmacyInventoryMessages from '../messages/id/pharmacy-inventory.json';
import idSharedMessages from '../messages/id/shared.json';
import idVaultMessages from '../messages/id/vault.json';

/**
 * Every catalog, not just the two that used to be checked. Indonesian is the
 * product's primary language, so an English-only string is a defect rather
 * than a gradual-translation state — and the earlier spec covered `en.json`
 * (which holds a single key) plus pharmacy inventory, leaving the catalogs
 * that carry almost all of the UI text unguarded.
 */
const CATALOG_PAIRS: ReadonlyArray<readonly [string, unknown, unknown]> = [
  ['root', enMessages, idMessages],
  ['auth-shell', enAuthShellMessages, idAuthShellMessages],
  ['clinical', enClinicalMessages, idClinicalMessages],
  ['dashboard-ai', enDashboardAiMessages, idDashboardAiMessages],
  ['operations', enOperationsMessages, idOperationsMessages],
  ['pharmacy-inventory', enPharmacyInventoryMessages, idPharmacyInventoryMessages],
  ['shared', enSharedMessages, idSharedMessages],
  ['vault', enVaultMessages, idVaultMessages],
];

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function readLeaf(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages);
}

describe('translation catalogs', () => {
  it.each(CATALOG_PAIRS)(
    'keeps the %s catalog in key parity across locales',
    (_catalog, english, indonesian) => {
      expect(collectLeafKeys(english).sort()).toEqual(collectLeafKeys(indonesian).sort());
    },
  );

  it.each(
    CATALOG_PAIRS.flatMap(([catalog, english, indonesian]) => [
      [`${catalog} (en)`, english] as const,
      [`${catalog} (id)`, indonesian] as const,
    ]),
  )('contains no empty %s messages', (_label, messages) => {
    for (const key of collectLeafKeys(messages)) {
      const value = readLeaf(messages, key);
      expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
    }
  });
});
