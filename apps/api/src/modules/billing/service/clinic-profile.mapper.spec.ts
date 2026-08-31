import { ClinicProfileRecord } from '@hms/shared-types';

import { toClinicProfileView } from './clinic-profile.mapper';

describe('toClinicProfileView', () => {
  const record: ClinicProfileRecord = {
    id: 'f0e1d2c3-4b5a-4988-9776-655443322110',
    name: 'Klinik Sehat Bersama',
    legalName: 'PT Sehat Bersama Indonesia',
    address: 'Jl. Merdeka No. 12, Bandung',
    phoneNumber: '(022) 1234567',
    email: 'halo@kliniksehat.id',
    licenseNumber: '440/1234/DPMPTSP',
    taxId: '01.234.567.8-901.000',
    logoStorageKey: null,
    logoMimeType: null,
    createdAt: new Date('2026-09-18T02:00:00.000Z'),
    updatedAt: new Date('2026-09-18T02:15:00.000Z'),
  };

  it('projects the stored fields and serialises the timestamp', () => {
    const actual = toClinicProfileView(record);

    expect(actual).toEqual({
      name: 'Klinik Sehat Bersama',
      legalName: 'PT Sehat Bersama Indonesia',
      address: 'Jl. Merdeka No. 12, Bandung',
      phoneNumber: '(022) 1234567',
      email: 'halo@kliniksehat.id',
      licenseNumber: '440/1234/DPMPTSP',
      taxId: '01.234.567.8-901.000',
      hasLogo: false,
      updatedAt: '2026-09-18T02:15:00.000Z',
    });
  });

  it('never leaks the storage key, only whether a logo exists', () => {
    // The key is the one field that must not travel: a client that had it
    // could name it in a PATCH, and the confirm path exists precisely to stop
    // an arbitrary key becoming the letterhead (D-018).
    const actual = toClinicProfileView({
      ...record,
      logoStorageKey: 'clinic-profile/logo/stored/abc.png',
      logoMimeType: 'image/png',
    });

    expect(actual.hasLogo).toBe(true);
    expect(JSON.stringify(actual)).not.toContain('clinic-profile/logo');
  });

  it('reports a configured logo even when no URL was minted for this response', () => {
    // `logoUrl === undefined` must not be read as "no logo": a signed URL is
    // minted per response and a caller may deliberately skip it.
    const actual = toClinicProfileView({
      ...record,
      logoStorageKey: 'clinic-profile/logo/stored/abc.png',
      logoMimeType: 'image/png',
    });

    expect(actual).toMatchObject({ hasLogo: true });
    expect(actual.logoUrl).toBeUndefined();
  });

  it('includes the signed URL when one is given', () => {
    const actual = toClinicProfileView(
      {
        ...record,
        logoStorageKey: 'clinic-profile/logo/stored/abc.png',
        logoMimeType: 'image/png',
      },
      'https://storage.example/signed',
    );

    expect(actual.logoUrl).toBe('https://storage.example/signed');
  });
});
