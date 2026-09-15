import { DoctorAuthorityRecord } from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { DoctorAuthorityConflictError } from '../repository/doctor-authority-conflict.error';
import { DoctorAuthorityRepository } from '../repository/doctor-authority.repository';
import { DoctorAuthorityService } from './doctor-authority.service';

const DOCTOR_ID = '1f0a3d94-5c2b-4b31-9c8d-77bf1c3a0e21';
const AUTHORITY_ID = '7c2e1f7a-3b6d-4d0e-9a1f-5e8c2b7d4a10';
const ACTOR = { sub: 'admin-user', email: 'admin@hms.local' };

function buildRecord(overrides: Partial<DoctorAuthorityRecord> = {}): DoctorAuthorityRecord {
  return {
    id: AUTHORITY_ID,
    doctorId: DOCTOR_ID,
    kind: 'IUD_IMPLANT',
    trainingCertificateNumber: null,
    decreeNumber: '440/123/2026',
    decreeIssuedAt: new Date('2025-12-15T00:00:00.000Z'),
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: new Date('2027-12-31T00:00:00.000Z'),
    decreeStorageKey: null,
    decreeMimeType: null,
    decreeSizeBytes: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdById: 'admin-user',
    createdAt: new Date('2026-01-02T03:00:00.000Z'),
    updatedAt: new Date('2026-01-02T03:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('DoctorAuthorityService', () => {
  const repositoryMock = {
    findClinicianById: jest.fn(),
    listByDoctor: jest.fn(),
    findById: jest.fn(),
    hasLiveAuthority: jest.fn(),
    hasActiveAuthority: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    listExpiringAuthorities: jest.fn(),
    claimExpiryNotice: jest.fn(),
  };
  const storageMock = {
    generateObjectKey: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const configServiceMock = { get: jest.fn() };
  let service: DoctorAuthorityService;

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockReturnValue('Asia/Jakarta');
    repositoryMock.findClinicianById.mockResolvedValue({
      id: DOCTOR_ID,
      fullName: 'Bd. Siti Aminah',
      profession: 'MIDWIFE',
    });
    repositoryMock.hasLiveAuthority.mockResolvedValue(false);
    repositoryMock.create.mockImplementation(async ({ decree, ...payload }) =>
      buildRecord({
        ...payload,
        decreeStorageKey: decree?.storageKey ?? null,
        decreeMimeType: decree?.mimeType ?? null,
        decreeSizeBytes: decree?.sizeBytes ?? null,
      }),
    );
    service = new DoctorAuthorityService(
      repositoryMock as unknown as DoctorAuthorityRepository,
      storageMock as unknown as ObjectStorageService,
      configServiceMock as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('hasActiveAuthority', () => {
    it('passes the requested calendar date through as midnight UTC', async () => {
      repositoryMock.hasActiveAuthority.mockResolvedValue(true);

      const actual = await service.hasActiveAuthority({
        doctorId: DOCTOR_ID,
        kind: 'MTBS',
        onDate: '2027-12-31',
      });

      expect(actual).toBe(true);
      expect(repositoryMock.hasActiveAuthority).toHaveBeenCalledWith(
        DOCTOR_ID,
        'MTBS',
        new Date('2027-12-31T00:00:00.000Z'),
      );
    });

    it('resolves today in the clinic time zone, not UTC, when no date is given', async () => {
      // 23:30 WIB on 15 September is 16:30 UTC the same day — but the
      // clinic's day boundary is what matters, so the check is against the
      // 16th only after midnight in Jakarta. Here it is 00:30 WIB on the 16th
      // while UTC still reads the 15th.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-15T17:30:00.000Z'));
      repositoryMock.hasActiveAuthority.mockResolvedValue(false);

      await service.hasActiveAuthority({ doctorId: DOCTOR_ID, kind: 'MTBS' });

      expect(repositoryMock.hasActiveAuthority).toHaveBeenCalledWith(
        DOCTOR_ID,
        'MTBS',
        new Date('2026-09-16T00:00:00.000Z'),
      );
    });
  });

  describe('createAuthority', () => {
    const input = {
      kind: 'IUD_IMPLANT' as const,
      decreeNumber: '440/123/2026',
      decreeIssuedAt: '2025-12-15',
      validFrom: '2026-01-01',
      validUntil: '2027-12-31',
    };

    it('refuses a DOCTOR profile with 422 DOCTOR_AUTHORITY_REQUIRES_MIDWIFE', async () => {
      repositoryMock.findClinicianById.mockResolvedValue({
        id: DOCTOR_ID,
        fullName: 'dr. Budi',
        profession: 'DOCTOR',
      });

      const actual = service.createAuthority(DOCTOR_ID, input, ACTOR);

      await expect(actual).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(actual).rejects.toMatchObject({
        response: { code: 'DOCTOR_AUTHORITY_REQUIRES_MIDWIFE' },
      });
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses a second live row of the same kind with 409 DOCTOR_AUTHORITY_ALREADY_ACTIVE', async () => {
      repositoryMock.hasLiveAuthority.mockResolvedValue(true);

      const actual = service.createAuthority(DOCTOR_ID, input, ACTOR);

      await expect(actual).rejects.toBeInstanceOf(ConflictException);
      await expect(actual).rejects.toMatchObject({
        response: { code: 'DOCTOR_AUTHORITY_ALREADY_ACTIVE' },
      });
    });

    it('maps the partial-index race to the same 409', async () => {
      repositoryMock.create.mockRejectedValue(new DoctorAuthorityConflictError());

      await expect(service.createAuthority(DOCTOR_ID, input, ACTOR)).rejects.toMatchObject({
        response: { code: 'DOCTOR_AUTHORITY_ALREADY_ACTIVE' },
      });
    });

    it('records the grant with the actor and returns it as active', async () => {
      const actual = await service.createAuthority(DOCTOR_ID, input, ACTOR);

      expect(repositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          kind: 'IUD_IMPLANT',
          createdById: 'admin-user',
          validUntil: new Date('2027-12-31T00:00:00.000Z'),
          decree: null,
        }),
      );
      expect(actual).toMatchObject({ kind: 'IUD_IMPLANT', hasDecree: false, status: 'ACTIVE' });
    });

    it('refuses a storage key minted outside this clinician’s prefix without touching storage', async () => {
      const actual = service.createAuthority(
        DOCTOR_ID,
        {
          ...input,
          decreeStorageKey: 'documents/vault/doctor/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf',
        },
        ACTOR,
      );

      await expect(actual).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.headObject).not.toHaveBeenCalled();
      expect(repositoryMock.create).not.toHaveBeenCalled();
    });

    it('reads the letter back from storage before recording it', async () => {
      const storageKey = `doctor-authorities/${DOCTOR_ID}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.pdf`;
      storageMock.headObject.mockResolvedValue({
        key: storageKey,
        sizeBytes: 1024,
        contentType: 'application/pdf',
      });

      const actual = await service.createAuthority(
        DOCTOR_ID,
        { ...input, decreeStorageKey: storageKey },
        ACTOR,
      );

      expect(repositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          decree: { storageKey, mimeType: 'application/pdf', sizeBytes: 1024 },
        }),
      );
      expect(actual.hasDecree).toBe(true);
    });
  });

  describe('updateAuthority', () => {
    it('cannot change the kind: the input type has no such field and a stray one is ignored', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.update.mockResolvedValue(buildRecord({ decreeNumber: '440/124/2026' }));
      const inputWithStrayKind = { decreeNumber: '440/124/2026', kind: 'MTBS' };

      await service.updateAuthority(DOCTOR_ID, AUTHORITY_ID, inputWithStrayKind);

      const [, actualPayload] = repositoryMock.update.mock.calls[0];
      expect(actualPayload).not.toHaveProperty('kind');
      expect(actualPayload.decreeNumber).toBe('440/124/2026');
    });

    it('refuses an end date before the stored start date', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());

      await expect(
        service.updateAuthority(DOCTOR_ID, AUTHORITY_ID, { validUntil: '2025-12-31' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for an authority of another clinician', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.updateAuthority(DOCTOR_ID, AUTHORITY_ID, { decreeNumber: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revokeAuthority', () => {
    it('stamps the revocation with the actor and the reason', async () => {
      repositoryMock.findById.mockResolvedValue(buildRecord());
      repositoryMock.revoke.mockResolvedValue(
        buildRecord({ revokedAt: new Date('2026-06-01T02:00:00.000Z'), revokedById: 'admin-user' }),
      );

      const actual = await service.revokeAuthority(
        DOCTOR_ID,
        AUTHORITY_ID,
        { reason: 'Letter withdrawn' },
        ACTOR,
      );

      expect(repositoryMock.revoke).toHaveBeenCalledWith(
        AUTHORITY_ID,
        expect.objectContaining({ revokedById: 'admin-user', revokeReason: 'Letter withdrawn' }),
      );
      expect(actual.status).toBe('REVOKED');
    });

    it('refuses to revoke twice', async () => {
      repositoryMock.findById.mockResolvedValue(
        buildRecord({ revokedAt: new Date('2026-06-01T02:00:00.000Z') }),
      );

      await expect(
        service.revokeAuthority(DOCTOR_ID, AUTHORITY_ID, { reason: 'again' }, ACTOR),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listAuthorities', () => {
    it('judges status on the clinic day: expiring inside 60 days, expired after the end date', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2027-11-01T02:00:00.000Z'));
      repositoryMock.listByDoctor.mockResolvedValue([
        buildRecord({ id: 'soon' }),
        buildRecord({
          id: 'lapsed',
          kind: 'MTBS',
          validUntil: new Date('2027-10-31T00:00:00.000Z'),
        }),
        buildRecord({ id: 'open', kind: 'INTEGRATED_ANC', validUntil: null }),
      ]);

      const actual = await service.listAuthorities(DOCTOR_ID);

      expect(actual.map((row) => [row.id, row.status])).toEqual([
        ['soon', 'EXPIRING_SOON'],
        ['lapsed', 'EXPIRED'],
        ['open', 'ACTIVE'],
      ]);
    });
  });
});
