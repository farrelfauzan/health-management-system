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
    // P16-T21, epic E1. The rendered artefact, not the ledger: switching this
    // off leaves invoicing, tariffs and payments exactly as they were and
    // takes away the PDF and the layouts it renders from. Billing itself is a
    // separate key, and deliberately so — a clinic that bills on paper still
    // bills.
    key: 'invoice-documents',
    name: 'Invoice Documents',
    description: 'Invoice and receipt PDFs, and the templates they render from.',
    // No nav entry of its own: templates are a tab inside `/admin/billing`,
    // and the download is a button on an invoice. The guard is the whole
    // control here — there is no link to hide.
    navHrefs: [],
  },
  {
    // P16-T21, epic E2. The patient's clinical file: scans, lab reports,
    // referral letters, and the portal surface that releases them.
    key: 'patient-documents',
    name: 'Patient Documents',
    description: "Clinical files attached to a patient's record, and their release to the portal.",
    // Every surface is a tab inside a patient record or the portal, and the
    // portal shell does not consume `navHrefs` — it renders a patient's own
    // fixed navigation. Nothing to hide by href.
    navHrefs: [],
  },
  {
    // P16-T21, epic E3. The doctor's own drawer. Its own key because it is
    // the one document feature with no clinic-side reader at all: there is no
    // `ANY` grant over a vault, so an entitlement is the only lever an
    // administrator has over it.
    key: 'doctor-credentials',
    name: 'Doctor Credentials Vault',
    description: 'A doctor’s private store for licences and credentials, and the shares they grant.',
    navHrefs: ['/doctor/vault'],
  },
  {
    // P16-T21, epic E4. Sending a bill out of the building — WhatsApp and
    // email — which is the phase's highest-consequence surface and the one
    // §10 pilots most cautiously. Depends on `invoice-documents`: there is
    // nothing to deliver without the PDF.
    key: 'invoice-delivery',
    name: 'Invoice Delivery',
    description: 'Sending invoices to patients over WhatsApp or email, with tokenised links.',
    // A dialog on an invoice, not a page.
    navHrefs: [],
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

/**
 * Features that cannot be switched on while the feature they are built out of
 * is off (`P16-T21`, §10.6).
 *
 * One entry today, and it is the one that matters: delivery sends the invoice
 * *PDF*, so enabling it without `invoice-documents` would give a clinic a
 * send button with nothing behind it — and the failure would surface as a
 * broken message to a patient rather than as a refused toggle to an operator.
 *
 * Deliberately one-directional. Turning `invoice-documents` off does **not**
 * cascade: a rollback that silently switched off a second feature would be
 * wider than the operator asked for, and §10.6 wants each step deliberate.
 * The dependent feature's own guard refuses its routes anyway.
 */
export const FEATURE_PREREQUISITES: Readonly<Partial<Record<FeatureKey, FeatureKey>>> = {
  'invoice-delivery': 'invoice-documents',
};

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
