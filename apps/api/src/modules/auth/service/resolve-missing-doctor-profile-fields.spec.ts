import { createDoctorSchema, resolveMissingDoctorProfileFields } from '@hms/shared-types';

/**
 * The one definition of a complete doctor profile (P20-T02), exercised from
 * the API because it is what gates a session at issuance.
 */
describe('resolveMissingDoctorProfileFields', () => {
  const completeProfile = {
    fullName: 'Dr. Budi Santoso',
    phoneNumber: '628129876543',
    specialtyId: '0f1cbb1f-8f4a-4bb0-9a5e-2d94f7a3c111',
    licenseNumber: 'STR-33-2020-000123',
    nikLast4: '0002',
  };

  it('reports nothing missing for a profile an administrator created', () => {
    expect(resolveMissingDoctorProfileFields({ profile: completeProfile })).toEqual([]);
  });

  it('reports every required field missing when there is no profile at all', () => {
    expect(resolveMissingDoctorProfileFields({ profile: null }).sort()).toEqual(
      ['fullName', 'licenseNumber', 'nik', 'phoneNumber', 'specialtyId'].sort(),
    );
  });

  it('reads an encrypted NIK as present through its masked suffix', () => {
    expect(
      resolveMissingDoctorProfileFields({ profile: { ...completeProfile, nikLast4: null } }),
    ).toEqual(['nik']);
  });

  it('never asks for the email, which lives on the account (D-024)', () => {
    expect(resolveMissingDoctorProfileFields({ profile: null })).not.toContain('email');
  });

  it('re-opens the gate when a field is made required later, with no second list to update', () => {
    // Any required field will do; reusing one of the schema's own keeps this
    // spec free of a direct Zod dependency the API package does not declare.
    const schemaWithNewRequirement = createDoctorSchema.extend({
      strDocumentId: createDoctorSchema.shape.specialtyId,
    });

    const actualMissing = resolveMissingDoctorProfileFields({
      profile: completeProfile,
      schema: schemaWithNewRequirement,
    });

    expect(actualMissing).toEqual(['strDocumentId']);
  });
});
