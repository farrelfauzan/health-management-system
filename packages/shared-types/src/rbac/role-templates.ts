import type { RoleTemplate } from '#rbac/types';

/**
 * Ready-made permission sets for the custom roles clinics actually build
 * (P22-T05). Creating a role from one pre-ticks its keys, so its members can
 * sign in and do the job without an administrator knowing which prerequisites
 * the screens have.
 *
 * `role-templates.spec.ts` holds each one to that promise against the seeded
 * catalogue: every key exists, the set is already closed under
 * {@link expandPermissionDependencies}, it opens exactly one shell, it asks no
 * member for MFA, and the only clinical content it reaches is triage's vital
 * signs (D-033). A midwife is deliberately absent: the seeded `MIDWIFE` role is
 * the clinician role, and a copy composed here would miss every rule that
 * keys on the role code.
 */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    // Triage at the front desk: measure before the doctor, bill after.
    code: 'FRONT_NURSE',
    permissionKeys: [
      'portal.admin-access:any',
      'patient.read:any',
      'registration.read:any',
      'encounter.record-vitals:any',
      'encounter.read-summary:any',
      'invoice.read:any',
      'invoice.write:any',
    ],
  },
  {
    // The cashier: find the finished visit, bill it, take payment, send it.
    code: 'CASHIER',
    permissionKeys: [
      'portal.admin-access:any',
      'patient.read:any',
      'registration.read:any',
      'encounter.read-summary:any',
      'invoice.read:any',
      'invoice.write:any',
      'invoice.deliver:any',
      'payment.write:any',
      'service-tariff.read:any',
    ],
  },
  {
    // The registration desk: patients, bookings, the queue, and opening the
    // visit for the doctor.
    code: 'RECEPTIONIST',
    permissionKeys: [
      'portal.admin-access:any',
      'patient.read:any',
      'patient.create:any',
      'patient.update:any',
      'doctor.read:any',
      'registration.read:any',
      'registration.create:any',
      'registration.update:any',
      'appointment.read:any',
      'appointment.create:any',
      'appointment.update:any',
      'appointment.cancel:any',
      'appointment.session.read:any',
      'encounter.open:any',
      'encounter.read-summary:any',
    ],
  },
];
