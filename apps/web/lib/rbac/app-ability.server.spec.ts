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

/**
 * IMP-5 / D-022: the ADMIN_PORTAL_ADMIN_RULES preset exists for tokens minted
 * before the permissions claim; it must never shadow a token that carries
 * real claims. These specs pin down exactly when the fallback can fire —
 * and that all of this is visibility-only, because PermissionsGuard re-reads
 * the database on every API request regardless of what the claim says.
 */
describe('resolveAppAbilityRules legacy admin fallback (D-022)', () => {
  it('lets real claims win over the admin preset even when an admin role code is present', () => {
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        roles: ['ADMIN', 'FRONT_DESK_LEAD'],
        permissions: ['patient.read:any'],
      }),
    );

    expect(ability.can('read', 'Patient')).toBe(true);
    // The preset would grant these; the mapped claim set must not.
    expect(ability.can('create', 'User')).toBe(false);
    expect(ability.can('create', 'Patient')).toBe(false);
  });

  it('applies the admin preset for a legacy token with no permissions claim', () => {
    const ability = buildAppAbility(resolveAppAbilityRules({ roles: ['ADMIN'] }));

    expect(ability.can('create', 'User')).toBe(true);
    expect(ability.can('read', 'Role')).toBe(true);
  });

  it('gives a fallback SUPER_ADMIN the role lifecycle the seed actually grants it', () => {
    // The regression this branch exists for. SUPER_ADMIN holds
    // `role.create/update/delete:any` through seed.sql's catalog-wide grant,
    // but shared the ADMIN preset, which stops at `read` — so /admin/
    // administration rendered the Roles tab with no New role, Edit or Delete.
    const ability = buildAppAbility(resolveAppAbilityRules({ roles: ['SUPER_ADMIN'] }));

    expect(ability.can('create', 'Role')).toBe(true);
    expect(ability.can('update', 'Role')).toBe(true);
    expect(ability.can('delete', 'Role')).toBe(true);
    expect(ability.can('read', 'Role')).toBe(true);
    expect(ability.can('create', 'User')).toBe(true);
  });

  it('still withholds the role lifecycle from a fallback ADMIN', () => {
    // seed.sql withholds these from ADMIN deliberately; the fallback must not
    // hand back what the grant table refuses.
    const ability = buildAppAbility(resolveAppAbilityRules({ roles: ['ADMIN'] }));

    expect(ability.can('create', 'Role')).toBe(false);
    expect(ability.can('update', 'Role')).toBe(false);
    expect(ability.can('delete', 'Role')).toBe(false);
  });

  it('falls back for a SUPER_ADMIN whose only claim is the portal key', () => {
    // The real production path: the session-hint cookie carries `portal.*`
    // keys only, and none of them map to a UI rule, so an oversized or
    // expired access-token cookie lands every SUPER_ADMIN page load here.
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        roles: ['SUPER_ADMIN'],
        permissions: ['portal.admin-access:any'],
      }),
    );

    expect(ability.can('create', 'Role')).toBe(true);
  });

  it('grants a custom role nothing when its only claims do not map to UI rules', () => {
    // portal.* keys gate shells in proxy.ts but name no UI capability; a
    // custom role holding only those must not inherit the admin preset.
    const actualRules = resolveAppAbilityRules({
      roles: ['FRONT_DESK_LEAD'],
      permissions: ['portal.admin-access:any'],
    });

    expect(actualRules).toEqual([]);
  });

  it('still falls back for a seeded admin whose claims are all unmappable', () => {
    // A seeded ADMIN genuinely holds the preset capabilities server-side, so
    // showing them is honest; a custom role can never reach this branch
    // because role codes are unique and ADMIN/SUPER_ADMIN are seed-owned.
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        roles: ['ADMIN'],
        permissions: ['portal.admin-access:any'],
      }),
    );

    expect(ability.can('read', 'User')).toBe(true);
  });

  it('returns no rules for a custom role with neither claims nor a seeded admin code', () => {
    expect(resolveAppAbilityRules({ roles: ['FRONT_DESK_LEAD'] })).toEqual([]);
    expect(resolveAppAbilityRules(null)).toEqual([]);
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

  it('maps the three-segment organization keys to their own subjects', () => {
    // SJ-1. `permissionToRule` splits on the last dot, so these resolve to
    // resource `organization.structure` / `organization.member`. If either ever
    // collapsed to a bare `organization`, a grant to maintain the chart would
    // silently also read as a grant over headcount.
    const ability = buildAppAbility(
      resolveAppAbilityRules({
        permissions: [
          'organization.structure.read:any',
          'organization.structure.manage:any',
          'organization.member.manage:any',
        ],
      }),
    );

    expect(ability.can('read', 'OrganizationUnit')).toBe(true);
    expect(ability.can('manage', 'OrganizationUnit')).toBe(true);
    expect(ability.can('manage', 'OrganizationUnitMember')).toBe(true);
  });

  it('lets a read-only organization grant see the chart without editing it', () => {
    // This is the account SJ-2's read-only tree exists for: the nav entry and
    // the page must resolve, and every edit control must not.
    const ability = buildAppAbility(
      resolveAppAbilityRules({ permissions: ['organization.structure.read:any'] }),
    );

    expect(ability.can('read', 'OrganizationUnit')).toBe(true);
    expect(ability.can('manage', 'OrganizationUnit')).toBe(false);
    expect(ability.can('manage', 'OrganizationUnitMember')).toBe(false);
  });
});
