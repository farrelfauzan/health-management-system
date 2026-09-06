import type { FeatureCatalogEntry, FeatureKey } from '#feature-entitlement/types';

/**
 * Every optional product feature a client can be sold, or not sold (IMP-6).
 *
 * This list is the definition; `feature_entitlements` rows are only the
 * on/off *state* for keys that appear here. Both sides read it — the seed
 * converges the table onto it, the admin screen renders it, and IMP-8's
 * `@RequireFeature()` decorators name keys from it — so a feature exists in
 * exactly one place and a typo cannot become a silently ungated endpoint.
 *
 * What is deliberately **absent** is as load-bearing as what is present:
 * `auth`, `health`, `rbac`, `admin-management`, patients, doctors, and
 * appointments are platform core. A clinic that switched off patients would
 * not have a cheaper HMS, it would have a broken one, so those are not
 * entitlements and never get a key.
 */
export const FEATURE_CATALOG: readonly FeatureCatalogEntry[] = [
  {
    key: 'ai-chatbot',
    name: 'AI Assistant',
    description:
      'The in-app chatbot for staff and patients, and the provider credentials behind it.',
    navHrefs: ['/admin/ai-assistant', '/admin/ai-providers', '/doctor/ai-assistant'],
  },
  {
    key: 'room-management',
    name: 'Rooms & Inpatient',
    description: 'Ward, room and bed inventory, admissions, transfers and discharge.',
    navHrefs: ['/admin/rooms', '/admin/admissions'],
  },
  {
    key: 'pharmacy',
    name: 'Pharmacy',
    description: 'Prescriptions, dispensing and medication stock.',
    navHrefs: ['/admin/pharmacy'],
  },
  {
    key: 'billing',
    name: 'Billing',
    description: 'Invoices, service tariffs and payments.',
    navHrefs: ['/admin/billing'],
  },
  {
    key: 'bpjs-pcare',
    name: 'BPJS PCare',
    description: 'Membership eligibility checks and PCare visit submissions.',
    navHrefs: ['/admin/integrations'],
  },
  {
    key: 'bpjs-antrean',
    name: 'BPJS Antrean',
    description: 'Mobile JKN queue bridging, inbound and outbound.',
    navHrefs: ['/admin/integrations'],
  },
  {
    key: 'satusehat',
    name: 'SATUSEHAT',
    description: 'FHIR bundle submission to the Kemenkes national platform.',
    navHrefs: ['/admin/integrations'],
  },
  {
    key: 'document-management',
    name: 'Documents & Knowledge Base',
    description: 'Personal document storage and the shared clinic corpus.',
    navHrefs: ['/admin/knowledge-base', '/admin/clinic-corpus', '/doctor/knowledge-base'],
  },
  {
    // P16-T29/T31. The approval workflow over the documents module, not the
    // module itself: switching it off leaves the registry, the search and the
    // export exactly as they were, and takes away the second signature. A
    // clinic small enough that one person writes and issues everything is not
    // served by a queue that always names them.
    key: 'document-approval',
    name: 'Document Approval',
    description:
      'Approval rounds over the documents registry: named approvers, deadlines and the approval queue.',
    navHrefs: [],
  },
  {
    key: 'cs-channels',
    name: 'Customer Service Channels',
    description: 'The WhatsApp and Telegram inbox, and booking by chat.',
    navHrefs: ['/admin/conversations'],
  },
];

/** Every catalog key, in catalog order. */
export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_CATALOG.map((entry) => entry.key);

/**
 * Narrows an arbitrary string to a catalog key. The admin API calls this
 * before writing: a row for a key nothing implements would be a switch that
 * silently controls nothing, which is worse than a 400.
 */
export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_CATALOG.some((entry) => entry.key === value);
}

/** The catalog entry for a key, or `undefined` when the key is not one. */
export function findFeatureCatalogEntry(key: string): FeatureCatalogEntry | undefined {
  return FEATURE_CATALOG.find((entry) => entry.key === key);
}
