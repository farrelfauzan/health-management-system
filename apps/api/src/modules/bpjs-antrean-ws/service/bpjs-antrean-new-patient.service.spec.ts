import { CurrentUser } from '../../../common/auth/current-user.type';
import { PrivacyNoticeRepository } from '../../../common/privacy-notice/privacy-notice.repository';
import { PatientManagementService } from '../../patient-management/service/patient-management.service';
import { BpjsAntreanNewPatientService } from './bpjs-antrean-new-patient.service';

const ACTOR: CurrentUser = { sub: 'system-actor-id', email: 'bridge@system.hms.local' };

const REQUEST = {
  nomorkartu: '0001234567890',
  nik: '3201011234567890',
  nama: 'Budi Santoso',
  jeniskelamin: 'L' as const,
  tanggallahir: '1985-03-12',
  nohp: '081200000000',
  alamat: 'Jl. Merdeka No. 12',
};

function buildService(overrides: {
  listPatients?: jest.Mock;
  getPatientById?: jest.Mock;
  createPatient?: jest.Mock;
  findCurrentVersion?: jest.Mock;
}) {
  const patientService = {
    listPatients: overrides.listPatients ?? jest.fn().mockResolvedValue({ items: [] }),
    getPatientById: overrides.getPatientById ?? jest.fn(),
    createPatient:
      overrides.createPatient ??
      jest
        .fn()
        .mockResolvedValue({ patient: { mrn: '00000042', fullName: 'Budi Santoso' } }),
  } as unknown as PatientManagementService;
  const privacyNoticeRepository = {
    findCurrentVersion:
      overrides.findCurrentVersion ?? jest.fn().mockResolvedValue({ id: 'notice-version-1' }),
  } as unknown as PrivacyNoticeRepository;
  return {
    service: new BpjsAntreanNewPatientService(patientService, privacyNoticeRepository),
    patientService,
  };
}

describe('BpjsAntreanNewPatientService', () => {
  it('registers a member and defers the privacy notice honestly', async () => {
    // The member acknowledged BPJS's notice in Mobile JKN, not the clinic's,
    // and nobody was present to provide it. Recording ACKNOWLEDGED would be
    // fabricated evidence in an append-only legal record.
    const createPatient = jest
      .fn()
      .mockResolvedValue({ patient: { mrn: '00000042', fullName: 'Budi Santoso' } });
    const { service } = buildService({ createPatient });

    const actual = await service.registerMember(REQUEST, ACTOR);

    expect(actual.norm).toBe('00000042');
    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Budi Santoso',
        sex: 'MALE',
        nik: '3201011234567890',
        bpjsNumber: '0001234567890',
        privacyNotice: {
          privacyNoticeVersionId: 'notice-version-1',
          locale: 'id',
          outcome: 'DEFERRED_REMOTE_REGISTRATION',
          subjectType: 'SELF',
          provenance: 'BPJS_ANTREAN',
        },
      }),
      ACTOR,
    );
  });

  it('maps the BPJS sex code to the HMS enum', async () => {
    const createPatient = jest
      .fn()
      .mockResolvedValue({ patient: { mrn: '00000043', fullName: 'Siti' } });
    const { service } = buildService({ createPatient });

    await service.registerMember({ ...REQUEST, jeniskelamin: 'P', nama: 'Siti' }, ACTOR);

    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({ sex: 'FEMALE' }),
      ACTOR,
    );
  });

  it('returns the existing MRN instead of creating a second record', async () => {
    // BPJS calls this whenever *its* records show no MRN here, which is not
    // the same question as whether HMS has a record. A duplicate patient is a
    // split medical history, and retention makes it permanent.
    const createPatient = jest.fn();
    const { service } = buildService({
      listPatients: jest.fn().mockResolvedValue({ items: [{ id: 'patient-1' }] }),
      getPatientById: jest
        .fn()
        .mockResolvedValue({ id: 'patient-1', mrn: '00000001', fullName: 'Budi Santoso' }),
      createPatient,
    });

    const actual = await service.registerMember(REQUEST, ACTOR);

    expect(actual.norm).toBe('00000001');
    expect(actual.keterangan).toMatch(/sudah terdaftar/);
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('dedupes on NIK when the card number finds nothing', async () => {
    const listPatients = jest
      .fn()
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [{ id: 'patient-2' }] });
    const createPatient = jest.fn();
    const { service } = buildService({
      listPatients,
      getPatientById: jest
        .fn()
        .mockResolvedValue({ id: 'patient-2', mrn: '00000002', fullName: 'Budi Santoso' }),
      createPatient,
    });

    const actual = await service.registerMember(REQUEST, ACTOR);

    expect(actual.norm).toBe('00000002');
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('refuses to register when no privacy notice version is published', async () => {
    // Without a current notice there is nothing to defer *to*, and the record
    // would carry no evidence trail at all.
    const { service } = buildService({ findCurrentVersion: jest.fn().mockResolvedValue(null) });

    await expect(service.registerMember(REQUEST, ACTOR)).rejects.toThrow(/belum siap/);
  });
});
