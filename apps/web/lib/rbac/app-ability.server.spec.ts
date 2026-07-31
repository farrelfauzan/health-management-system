import { buildAppAbility } from '@hms/ui';
import { describe, expect, it } from 'vitest';

import { resolveAppAbilityRules } from './app-ability.server';

describe('resolveAppAbilityRules integration permissions', () => {
  it('maps pharmacy inventory permissions independently from medication catalog permissions', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'medication.read:any',
          'medication.update:any',
          'inventory.read:any',
          'inventory.write:any',
        ],
      }),
    );

    expect(ability.can('read', 'Medication')).toBe(true);
    expect(ability.can('update', 'Medication')).toBe(true);
    expect(ability.can('create', 'Medication')).toBe(false);
    expect(ability.can('read', 'Inventory')).toBe(true);
    expect(ability.can('write', 'Inventory')).toBe(true);
  });

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

  it('maps each chat and AI-provider permission to its frontend capability', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'chat.session.create:own',
          'chat.session.read:any',
          'chat.session.delete:own',
          'chat.message.create:own',
          'chat.message.read:any',
          'ai-provider.read:any',
          'ai-provider.write:any',
        ],
      }),
    );

    expect(ability.can('create', 'ChatSession')).toBe(true);
    expect(ability.can('read', 'ChatSession')).toBe(true);
    expect(ability.can('delete', 'ChatSession')).toBe(true);
    expect(ability.can('create', 'ChatMessage')).toBe(true);
    expect(ability.can('read', 'ChatMessage')).toBe(true);
    expect(ability.can('read', 'AiProviderConfig')).toBe(true);
    expect(ability.can('write', 'AiProviderConfig')).toBe(true);
  });

  it('hides the provider settings surface from a chat-only user', () => {
    // What a seeded PATIENT or DOCTOR carries: they chat, they never see the
    // key that pays for it.
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'chat.session.create:own',
          'chat.session.read:own',
          'chat.session.delete:own',
          'chat.message.create:own',
          'chat.message.read:own',
        ],
      }),
    );

    expect(ability.can('create', 'ChatSession')).toBe(true);
    expect(ability.can('read', 'AiProviderConfig')).toBe(false);
    expect(ability.can('write', 'AiProviderConfig')).toBe(false);
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

describe('resolveAppAbilityRules for a seeded DOCTOR', () => {
  // The exact claim the API now issues for dokter@salingjaga.com.
  const DOCTOR_PERMISSIONS = [
    'appointment.cancel:own',
    'appointment.create:own',
    'appointment.read:own',
    'appointment.session.read:any',
    'appointment.update:own',
    'auth.logout:own',
    'doctor.read-identifier:own',
    'doctor.read:own',
    'doctor.schedule.write:own',
    'doctor-patient.activity.read:own',
    'encounter.read:own',
    'encounter.write:own',
    'icd10-code.read:any',
    'icd9cm-code.read:any',
    'patient.read:own',
    'prescription.read:own',
  ];

  it('grants the clinical capabilities a doctor needs', () => {
    const ability = buildAppAbility(resolveAppAbilityRules({ permissions: DOCTOR_PERMISSIONS }));

    expect(ability.can('read', 'Encounter')).toBe(true);
    expect(ability.can('write', 'Encounter')).toBe(true);
    expect(ability.can('read', 'Patient')).toBe(true);
    expect(ability.can('read', 'Icd10Code')).toBe(true);
    expect(ability.can('read', 'Icd9cmCode')).toBe(true);
    expect(ability.can('read-identifier', 'Doctor')).toBe(true);
  });

  it('withholds what the doctor was never granted', () => {
    const ability = buildAppAbility(resolveAppAbilityRules({ permissions: DOCTOR_PERMISSIONS }));

    expect(ability.can('read', 'Invoice')).toBe(false);
    expect(ability.can('write', 'Payment')).toBe(false);
    expect(ability.can('read', 'User')).toBe(false);
    expect(ability.can('manage', 'BpjsConfig')).toBe(false);
    expect(ability.can('read-identifier', 'Patient')).toBe(false);
  });

  it('does not fall back to admin rules just because permissions are present', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({ permissions: DOCTOR_PERMISSIONS, roles: ['DOCTOR'] }),
    );

    expect(ability.can('create', 'Patient')).toBe(false);
  });
});
