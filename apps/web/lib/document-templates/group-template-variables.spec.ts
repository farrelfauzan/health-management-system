import { INVOICE_TEMPLATE_VARIABLES } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { groupTemplateVariables } from './group-template-variables';

describe('groupTemplateVariables', () => {
  it('groups by token prefix in registry order and keeps a bare token as its own group', () => {
    const actual = groupTemplateVariables(INVOICE_TEMPLATE_VARIABLES);
    expect(actual.map((group) => group.prefix)).toEqual([
      'clinic',
      'invoice',
      'patient',
      'encounter',
      'admission',
      'payment',
      'items',
      'item',
    ]);
    expect(actual.find((group) => group.prefix === 'items')?.variables.map((v) => v.token)).toEqual([
      'items',
    ]);
  });
});
