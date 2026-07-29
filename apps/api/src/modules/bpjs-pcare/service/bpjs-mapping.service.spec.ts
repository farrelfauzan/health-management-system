import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { BpjsDphoCodeConflictError } from '../repository/bpjs-dpho-code-conflict.error';
import { BpjsMappingService } from './bpjs-mapping.service';

describe('BpjsMappingService', () => {
  const mockActor = { sub: 'actor-user', email: 'admin@example.com' };
  const mockDoctorRecord = {
    doctorId: 'doctor-1',
    fullName: 'dr. Sinta Dewi',
    specialtyName: 'Dokter Umum',
    bpjsDoctorCode: '1234',
  };

  const mappingRepositoryMock = {
    listDoctorMappings: jest.fn(),
    listSpecialtyMappings: jest.fn(),
    setDoctorMapping: jest.fn(),
    setSpecialtyMapping: jest.fn(),
    setMedicationMapping: jest.fn(),
  };
  const referenceRepositoryMock = { existsByCatalogAndCode: jest.fn() };
  const auditServiceMock = { record: jest.fn() };

  function createService(): BpjsMappingService {
    return new BpjsMappingService(
      mappingRepositoryMock as never,
      referenceRepositoryMock as never,
      auditServiceMock as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    referenceRepositoryMock.existsByCatalogAndCode.mockResolvedValue(true);
  });

  it('returns doctors and specialties together in the overview', async () => {
    mappingRepositoryMock.listDoctorMappings.mockResolvedValue([mockDoctorRecord]);
    mappingRepositoryMock.listSpecialtyMappings.mockResolvedValue([
      { specialtyId: 'specialty-1', name: 'Dokter Umum', bpjsPoliCode: null },
    ]);
    const service = createService();

    const actualOverview = await service.getOverview();

    expect(actualOverview.doctors).toHaveLength(1);
    expect(actualOverview.specialties).toHaveLength(1);
  });

  it('rejects an unknown code with a readable message naming the catalog', async () => {
    referenceRepositoryMock.existsByCatalogAndCode.mockResolvedValue(false);
    const service = createService();

    await expect(
      service.setDoctorMapping('doctor-1', { bpjsDoctorCode: '9999' }, mockActor as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.setDoctorMapping('doctor-1', { bpjsDoctorCode: '9999' }, mockActor as never),
    ).rejects.toThrow(/sync or search the DOKTER reference catalog first/);
    expect(mappingRepositoryMock.setDoctorMapping).not.toHaveBeenCalled();
  });

  it('clears a mapping without consulting the catalog', async () => {
    mappingRepositoryMock.setDoctorMapping.mockResolvedValue({
      ...mockDoctorRecord,
      bpjsDoctorCode: null,
    });
    const service = createService();

    const actualMapping = await service.setDoctorMapping(
      'doctor-1',
      { bpjsDoctorCode: null },
      mockActor as never,
    );

    expect(actualMapping.bpjsDoctorCode).toBeNull();
    expect(referenceRepositoryMock.existsByCatalogAndCode).not.toHaveBeenCalled();
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BPJS_MAPPING_UPDATED',
        resource: 'DoctorProfile',
        resourceId: 'doctor-1',
        metadata: { bpjsDoctorCode: null },
      }),
    );
  });

  it('maps a validated doctor code and audits the change', async () => {
    mappingRepositoryMock.setDoctorMapping.mockResolvedValue(mockDoctorRecord);
    const service = createService();

    const actualMapping = await service.setDoctorMapping(
      'doctor-1',
      { bpjsDoctorCode: '1234' },
      mockActor as never,
    );

    expect(actualMapping).toEqual(mockDoctorRecord);
    expect(referenceRepositoryMock.existsByCatalogAndCode).toHaveBeenCalledWith('DOKTER', '1234');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { bpjsDoctorCode: '1234' } }),
    );
  });

  it('returns 404 when the mapping target does not exist', async () => {
    mappingRepositoryMock.setSpecialtyMapping.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.setSpecialtyMapping('missing', { bpjsPoliCode: '001' }, mockActor as never),
    ).rejects.toThrow(NotFoundException);
    expect(auditServiceMock.record).not.toHaveBeenCalled();
  });

  it('maps a DPHO uniqueness race to 409', async () => {
    mappingRepositoryMock.setMedicationMapping.mockRejectedValue(
      new BpjsDphoCodeConflictError('K0001'),
    );
    const service = createService();

    await expect(
      service.setMedicationMapping('medication-1', { dphoCode: 'K0001' }, mockActor as never),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.setMedicationMapping('medication-1', { dphoCode: 'K0001' }, mockActor as never),
    ).rejects.toThrow(/already linked to another medication/);
  });
});
