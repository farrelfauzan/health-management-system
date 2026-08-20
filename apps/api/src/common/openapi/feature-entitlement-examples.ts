import { optionalExample } from './api-endpoint.decorator';

/** Canonical payloads for the IMP-7 entitlement routes. */
export const FEATURE_ENTITLEMENT_EXAMPLES = {
  entitlement: {
    key: 'bpjs-pcare',
    name: 'BPJS PCare',
    description: 'Membership eligibility checks and PCare visit submissions.',
    navHrefs: ['/admin/integrations'],
    isEnabled: false,
    notes: optionalExample('Not in the clinic package; credentials never issued.'),
    updatedById: optionalExample('4f1b0f5c-1c2a-4a1e-9a1a-1b2c3d4e5f60'),
    updatedAt: optionalExample('2026-08-20T04:15:22.000Z'),
  },
  updateRequest: {
    isEnabled: false,
    notes: 'Not in the clinic package; credentials never issued.',
  },
  availability: {
    enabledKeys: ['ai-chatbot', 'pharmacy', 'billing', 'document-management'],
  },
} as const;
