import { buildAppAbility } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { resolveAppAbilityRules } from './app-ability.server';

describe('resolveAppAbilityRules integration permissions', () => {
  it('maps each BPJS permission to its frontend capability', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'bpjs.config.manage:any',
          'bpjs.reference.sync:any',
          'bpjs.reference.read:any',
          'bpjs.mapping.manage:any',
          'bpjs.eligibility.check:any',
          'bpjs.submission.read:any',
          'bpjs.submission.retry:any',
        ],
      }),
    );

    expect(ability.can('manage', 'BpjsConfig')).toBe(true);
    expect(ability.can('sync', 'BpjsReference')).toBe(true);
    expect(ability.can('read', 'BpjsReference')).toBe(true);
    expect(ability.can('manage', 'BpjsMapping')).toBe(true);
    expect(ability.can('check', 'BpjsEligibility')).toBe(true);
    expect(ability.can('read', 'BpjsSubmission')).toBe(true);
    expect(ability.can('retry', 'BpjsSubmission')).toBe(true);
  });

  it('maps SATUSEHAT link and submission permissions independently', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'satusehat.link:any',
          'satusehat.submission.read:any',
          'satusehat.submission.retry:any',
        ],
      }),
    );

    expect(ability.can('link', 'Satusehat')).toBe(true);
    expect(ability.can('read', 'SatusehatSubmission')).toBe(true);
    expect(ability.can('retry', 'SatusehatSubmission')).toBe(true);
    expect(ability.can('read', 'BpjsSubmission')).toBe(false);
  });

  it('keeps malformed and unknown permissions denied', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: ['bpjs.config.admin:any', 'bpjs.unknown.read:any', 'not-a-permission'],
      }),
    );

    expect(ability.can('manage', 'BpjsConfig')).toBe(false);
    expect(ability.can('read', 'BpjsSubmission')).toBe(false);
  });
});
