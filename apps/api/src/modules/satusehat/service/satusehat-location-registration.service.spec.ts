import { SatusehatLocationSourceRecords } from '@hms/shared-types';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { SatusehatLocationClient } from '../../../common/satusehat/satusehat-location.client';
import { SatusehatError } from '../../../common/satusehat/satusehat.error';
import { SatusehatLocationRepository } from '../repository/satusehat-location.repository';
import { SatusehatLocationRegistrationService } from './satusehat-location-registration.service';
import { SatusehatLocationTreeService } from './satusehat-location-tree.service';

describe('SatusehatLocationRegistrationService', () => {
  const currentUser = { sub: 'admin-user', email: 'admin@clinic.local' };
  const mockRepository = { findLocationSources: jest.fn(), saveLocationId: jest.fn() };
  const mockClient = {
    findLocationIdByIdentifier: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn(),
  };
  const mockAudit = { record: jest.fn() };
  const env: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: '10000004',
    SATUSEHAT_CLIENT_ID: 'client',
    SATUSEHAT_CLIENT_SECRET: 'secret',
  };
  const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
  const repository = mockRepository as unknown as SatusehatLocationRepository;
  const service = new SatusehatLocationRegistrationService(
    repository,
    new SatusehatLocationTreeService(repository, configService),
    mockClient as unknown as SatusehatLocationClient,
    mockAudit as unknown as AuditService,
    configService,
  );

  function buildSources(overrides: Partial<SatusehatLocationSourceRecords> = {}): SatusehatLocationSourceRecords {
    return {
      clinic: { id: 'clinic', name: 'Klinik', latitude: -6.1754, longitude: 106.8272, satusehatLocationId: 'ihs-site' },
      specialties: [{ id: 'kia', name: 'Poli KIA', isActive: true, isDeleted: false, satusehatLocationId: null }],
      wards: [{ id: 'ward', code: 'MEL', name: 'Bangsal Melati', isActive: true, isDeleted: false, satusehatLocationId: null }],
      rooms: [
        {
          id: 'room',
          wardId: 'ward',
          code: 'MEL-01',
          name: 'Kamar 1',
          isActive: true,
          isDeleted: false,
          satusehatLocationId: null,
          roomClass: { name: 'Kelas 2', satusehatServiceClass: 'CLASS_2' },
        },
      ],
      beds: [{ id: 'bed', roomId: 'room', code: 'B1', isDeleted: false, satusehatLocationId: null }],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.findLocationIdByIdentifier.mockResolvedValue(null);
    mockClient.createLocation.mockImplementation((resource: { identifier: { value: string }[] }) =>
      Promise.resolve(`ihs-${resource.identifier[0]?.value}`),
    );
  });

  it('registers root → poli → ward → room → bed in order, each child partOf its fresh parent', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());

    const actualResult = await service.registerLocations({ all: true }, currentUser);

    expect(actualResult.outcomes.map((outcome) => [outcome.id, outcome.outcome])).toEqual([
      ['kia', 'CREATED'],
      ['ward', 'CREATED'],
      ['room', 'CREATED'],
      ['bed', 'CREATED'],
    ]);
    const bedResource = mockClient.createLocation.mock.calls[3]?.[0] as { partOf: { reference: string } };
    expect(bedResource.partOf.reference).toBe('Location/ihs-room');
    expect(mockAudit.record).toHaveBeenCalledTimes(4);
    expect(actualResult).toEqual(expect.objectContaining({ processedCount: 4, stoppedEarly: false }));
  });

  it('adopts a Location the identifier search finds, without a POST (US-LOC-02)', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());
    mockClient.findLocationIdByIdentifier.mockImplementation((_organizationId: string, localId: string) =>
      Promise.resolve(localId === 'kia' ? 'ihs-existing' : null),
    );

    const actualResult = await service.registerLocations({ targets: [{ kind: 'SPECIALTY', id: 'kia' }] }, currentUser);

    expect(actualResult.outcomes[0]).toEqual(expect.objectContaining({ outcome: 'ADOPTED', satusehatLocationId: 'ihs-existing' }));
    expect(mockClient.createLocation).not.toHaveBeenCalled();
    expect(mockRepository.saveLocationId).toHaveBeenCalledWith({ kind: 'SPECIALTY', id: 'kia', satusehatLocationId: 'ihs-existing' });
  });

  it('adopts through the search when the POST meets the duplicate rule', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());
    mockClient.findLocationIdByIdentifier.mockResolvedValueOnce(null).mockResolvedValueOnce('ihs-dup');
    mockClient.createLocation.mockRejectedValueOnce(
      new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'SATUSEHAT rejected the request (HTTP 400): Found duplicate: Location (RuleNumber: 20002)', 400),
    );

    const actualResult = await service.registerLocations({ targets: [{ kind: 'SPECIALTY', id: 'kia' }] }, currentUser);

    expect(actualResult.outcomes[0]).toEqual(expect.objectContaining({ outcome: 'ADOPTED', satusehatLocationId: 'ihs-dup' }));
  });

  it('blocks a child whose parent is unregistered instead of failing it', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());

    const actualResult = await service.registerLocations({ targets: [{ kind: 'ROOM', id: 'room' }] }, currentUser);

    expect(actualResult.outcomes[0]).toEqual(
      expect.objectContaining({ outcome: 'BLOCKED', message: 'Register "Bangsal Melati" first' }),
    );
    expect(mockClient.createLocation).not.toHaveBeenCalled();
  });

  it('names the unmapped room class', async () => {
    mockRepository.findLocationSources.mockResolvedValue(
      buildSources({
        wards: [{ id: 'ward', code: 'MEL', name: 'Bangsal Melati', isActive: true, isDeleted: false, satusehatLocationId: 'ihs-ward' }],
        rooms: [
          {
            id: 'room',
            wardId: 'ward',
            code: 'MEL-01',
            name: 'Kamar 1',
            isActive: true,
            isDeleted: false,
            satusehatLocationId: null,
            roomClass: { name: 'Kelas Utama', satusehatServiceClass: null },
          },
        ],
      }),
    );

    const actualResult = await service.registerLocations({ targets: [{ kind: 'ROOM', id: 'room' }] }, currentUser);

    expect(actualResult.outcomes[0]?.message).toContain('Kelas Utama');
  });

  it('stops the batch when the breaker opens and reports how many rows were done (NFR-05)', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());
    mockClient.createLocation
      .mockResolvedValueOnce('ihs-kia')
      .mockRejectedValueOnce(new SatusehatError('SATUSEHAT_CIRCUIT_OPEN', 'SATUSEHAT circuit breaker is open'));

    const actualResult = await service.registerLocations({ all: true }, currentUser);

    expect(actualResult.processedCount).toBe(1);
    expect(actualResult.stoppedEarly).toBe(true);
    expect(actualResult.outcomes.map((outcome) => outcome.outcome)).toEqual(['CREATED', 'SKIPPED', 'SKIPPED', 'SKIPPED']);
    expect(mockClient.createLocation).toHaveBeenCalledTimes(2);
  });

  it('fails one row on a rejection and carries on with the rest', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());
    mockClient.createLocation
      .mockResolvedValueOnce('ihs-kia')
      .mockRejectedValueOnce(new SatusehatError('SATUSEHAT_REQUEST_REJECTED', 'SATUSEHAT rejected the request (HTTP 400): bad name', 400));

    const actualResult = await service.registerLocations({ all: true }, currentUser);

    expect(actualResult.outcomes.map((outcome) => outcome.outcome)).toEqual(['CREATED', 'FAILED', 'BLOCKED', 'BLOCKED']);
    expect(actualResult.outcomes[1]?.message).toContain('bad name');
  });

  it('pushes a rename or a soft delete of a registered row as a PUT, never a delete (FR-LOC-08)', async () => {
    mockRepository.findLocationSources.mockResolvedValue(
      buildSources({
        wards: [{ id: 'ward', code: 'MEL', name: 'Bangsal Mawar', isActive: true, isDeleted: true, satusehatLocationId: 'ihs-ward' }],
      }),
    );

    const actualResult = await service.registerLocations({ targets: [{ kind: 'WARD', id: 'ward' }] }, currentUser);

    expect(actualResult.outcomes[0]?.outcome).toBe('UPDATED');
    expect(mockClient.updateLocation).toHaveBeenCalledWith(
      'ihs-ward',
      expect.objectContaining({ id: 'ihs-ward', name: 'Bangsal Mawar', status: 'inactive' }),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SATUSEHAT_LOCATION_UPDATED', actorUserId: 'admin-user' }));
  });

  it('stores a site known only from SATUSEHAT_LOCATION_ID without re-sending it', async () => {
    env.SATUSEHAT_LOCATION_ID = 'ihs-env-site';
    const envService = new SatusehatLocationRegistrationService(
      repository,
      new SatusehatLocationTreeService(repository, configService),
      mockClient as unknown as SatusehatLocationClient,
      mockAudit as unknown as AuditService,
      configService,
    );
    mockRepository.findLocationSources.mockResolvedValue(
      buildSources({ clinic: { id: 'clinic', name: 'Klinik', latitude: -6.1, longitude: 106.8, satusehatLocationId: null } }),
    );

    const actualResult = await envService.registerLocations({ targets: [{ kind: 'SITE', id: 'clinic' }] }, currentUser);
    delete env.SATUSEHAT_LOCATION_ID;

    expect(actualResult.outcomes[0]?.outcome).toBe('ADOPTED');
    expect(mockClient.updateLocation).not.toHaveBeenCalled();
    expect(mockRepository.saveLocationId).toHaveBeenCalledWith({ kind: 'SITE', id: 'clinic', satusehatLocationId: 'ihs-env-site' });
  });

  it('refuses a target that is not in the tree', async () => {
    mockRepository.findLocationSources.mockResolvedValue(buildSources());

    await expect(
      service.registerLocations({ targets: [{ kind: 'BED', id: 'gone' }] }, currentUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
