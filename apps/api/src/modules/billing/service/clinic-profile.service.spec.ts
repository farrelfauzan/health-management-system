import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { ClinicProfileRepository } from '../repository/clinic-profile.repository';
import { ClinicProfileService } from './clinic-profile.service';

const STAGED_KEY = 'clinic-profile/logo/staged/2f1c8e0a-9b3d-4f77-b0a1-6d5e4c3b2a19';
const STORED_KEY = 'clinic-profile/logo/stored/8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d.png';
const PREVIOUS_STORED_KEY = 'clinic-profile/logo/stored/1111aaaa-2222-3333-4444-555566667777.png';

describe('ClinicProfileService', () => {
  const clinicProfileRepositoryMock = {
    findProfile: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
  };
  const objectStorageServiceMock = {
    generateObjectKey: jest.fn(),
    getSignedUploadUrl: jest.fn(),
    getSignedUrl: jest.fn(),
    headObject: jest.fn(),
    getObject: jest.fn(),
    uploadObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn() };

  const service = new ClinicProfileService(
    clinicProfileRepositoryMock as unknown as ClinicProfileRepository,
    objectStorageServiceMock as unknown as ObjectStorageService,
    auditServiceMock as unknown as AuditService,
  );

  const actor = { sub: 'a1b2c3d4-0000-4000-8000-000000000001' } as CurrentUser;
  const updatedAt = new Date('2026-09-18T02:15:00.000Z');

  function buildRecord(overrides: Record<string, unknown> = {}) {
    return {
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
      createdAt: updatedAt,
      updatedAt,
      ...overrides,
    };
  }

  async function buildPngBytes(widthPixels = 64, heightPixels = 64): Promise<Uint8Array> {
    return new Uint8Array(
      await sharp({
        create: {
          width: widthPixels,
          height: heightPixels,
          channels: 4,
          background: { r: 15, g: 118, b: 110, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
  }

  function stageUploadedLogo(content: Uint8Array, contentType = 'image/png'): void {
    objectStorageServiceMock.headObject.mockResolvedValue({
      key: STAGED_KEY,
      sizeBytes: content.byteLength,
      contentType,
    });
    objectStorageServiceMock.getObject.mockResolvedValue({
      key: STAGED_KEY,
      body: content,
      contentType,
    });
    objectStorageServiceMock.generateObjectKey.mockReturnValue(STORED_KEY);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // `clearAllMocks` clears calls but keeps implementations, so the defaults
    // are re-declared here rather than leaking a `mockRejectedValueOnce` from
    // one test into the next.
    objectStorageServiceMock.deleteObject.mockResolvedValue(undefined);
    objectStorageServiceMock.uploadObject.mockResolvedValue({ key: STORED_KEY });
    objectStorageServiceMock.getSignedUrl.mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: '2026-09-18T02:20:00.000Z',
    });
  });

  describe('getProfile', () => {
    it('reports the profile as missing until it is configured', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);

      await expect(service.getProfile()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers without a logo URL when no logo is configured', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());

      const actual = await service.getProfile();

      expect(actual.hasLogo).toBe(false);
      expect(actual.logoUrl).toBeUndefined();
      expect(objectStorageServiceMock.getSignedUrl).not.toHaveBeenCalled();
    });

    it('mints a signed logo URL that serves inertly', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: STORED_KEY, logoMimeType: 'image/png' }),
      );

      const actual = await service.getProfile();

      expect(actual).toMatchObject({ hasLogo: true, logoUrl: 'https://storage.example/signed' });
      // Attachment disposition and a pinned content type (SJ-21 §5): the
      // storage origin must never render a stored file, even one we produced.
      expect(objectStorageServiceMock.getSignedUrl).toHaveBeenCalledWith({
        key: STORED_KEY,
        responseContentDisposition: 'attachment; filename="clinic-logo.png"',
        responseContentType: 'image/png',
      });
    });
  });

  describe('createLogoUploadUrl', () => {
    it('signs a staged upload without touching the profile', async () => {
      objectStorageServiceMock.generateObjectKey.mockReturnValue(STAGED_KEY);
      objectStorageServiceMock.getSignedUploadUrl.mockResolvedValue({
        url: 'https://storage.example/put',
        key: STAGED_KEY,
        expiresAt: '2026-09-18T02:20:00.000Z',
        requiredHeaders: { 'Content-Type': 'image/png' },
      });

      const actual = await service.createLogoUploadUrl({ mimeType: 'image/png', sizeBytes: 2048 });

      expect(objectStorageServiceMock.generateObjectKey).toHaveBeenCalledWith({
        keyPrefix: 'clinic-profile/logo/staged',
      });
      expect(objectStorageServiceMock.getSignedUploadUrl).toHaveBeenCalledWith({
        key: STAGED_KEY,
        contentType: 'image/png',
        contentLengthBytes: 2048,
      });
      expect(actual.storageKey).toBe(STAGED_KEY);
      expect(clinicProfileRepositoryMock.updateProfile).not.toHaveBeenCalled();
      expect(clinicProfileRepositoryMock.createProfile).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('requires a name on the first save', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);

      await expect(service.updateProfile({ address: 'Jl. Merdeka' }, actor)).rejects.toThrow(
        'name is required',
      );
      expect(clinicProfileRepositoryMock.createProfile).not.toHaveBeenCalled();
    });

    it('creates the singleton on the first save', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(null);
      clinicProfileRepositoryMock.createProfile.mockResolvedValue(buildRecord());

      const actual = await service.updateProfile({ name: 'Klinik Sehat Bersama' }, actor);

      expect(clinicProfileRepositoryMock.createProfile).toHaveBeenCalledWith({
        name: 'Klinik Sehat Bersama',
      });
      expect(actual.name).toBe('Klinik Sehat Bersama');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          resource: 'clinic-profile',
          metadata: { changedFields: ['name'], wasCreated: true },
        }),
      );
    });

    it('leaves omitted fields alone and clears the ones sent as null', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(buildRecord({ taxId: null }));

      await service.updateProfile({ taxId: null }, actor);

      // The three-state contract: absent is not the same as null, and a PATCH
      // that sent every column would wipe whatever it did not know about.
      expect(clinicProfileRepositoryMock.updateProfile).toHaveBeenCalledWith(
        'f0e1d2c3-4b5a-4988-9776-655443322110',
        { taxId: null },
      );
    });

    it('audits which fields changed and never their values', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(buildRecord());

      await service.updateProfile({ name: 'Klinik Baru', phoneNumber: '0800' }, actor);

      const auditedMetadata = auditServiceMock.record.mock.calls[0]?.[0]?.metadata as {
        changedFields: string[];
      };
      expect(auditedMetadata.changedFields).toEqual(['name', 'phoneNumber']);
      expect(JSON.stringify(auditedMetadata)).not.toContain('Klinik Baru');
    });

    it('refuses a storage key it did not mint', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());

      await expect(
        service.updateProfile({ logoStorageKey: 'documents/clinic/whatever.pdf' }, actor),
      ).rejects.toThrow('was not issued for a clinic logo upload');
      expect(objectStorageServiceMock.getObject).not.toHaveBeenCalled();
    });

    it('re-encodes the staged bytes and stores them under a key of its own', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: STORED_KEY, logoMimeType: 'image/png' }),
      );
      const uploadedContent = await buildPngBytes();
      stageUploadedLogo(uploadedContent);

      await service.updateProfile({ logoStorageKey: STAGED_KEY }, actor);

      const stored = objectStorageServiceMock.uploadObject.mock.calls[0]?.[0] as {
        key: string;
        body: Buffer;
        contentType: string;
      };
      expect(stored.key).toBe(STORED_KEY);
      expect(stored.contentType).toBe('image/png');
      // Not the bytes that were uploaded: the whole point of the re-encode is
      // that the stored object is one this process produced.
      expect(Buffer.from(uploadedContent).equals(stored.body)).toBe(false);
      expect(await sharp(stored.body).metadata()).toMatchObject({ format: 'png' });
      // The staged object is claimed exactly once and then removed.
      expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledWith({ key: STAGED_KEY });
      expect(clinicProfileRepositoryMock.updateProfile).toHaveBeenCalledWith(
        'f0e1d2c3-4b5a-4988-9776-655443322110',
        { logoStorageKey: STORED_KEY, logoMimeType: 'image/png' },
      );
    });

    it('deletes the replaced logo only after the new one is recorded', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: PREVIOUS_STORED_KEY, logoMimeType: 'image/png' }),
      );
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: STORED_KEY, logoMimeType: 'image/png' }),
      );
      stageUploadedLogo(await buildPngBytes());

      await service.updateProfile({ logoStorageKey: STAGED_KEY }, actor);

      const deletedKeys = objectStorageServiceMock.deleteObject.mock.calls.map(
        (call) => (call[0] as { key: string }).key,
      );
      expect(deletedKeys).toEqual([STAGED_KEY, PREVIOUS_STORED_KEY]);
    });

    it('clears both logo columns and drops the object when the logo is removed', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: PREVIOUS_STORED_KEY, logoMimeType: 'image/png' }),
      );
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(buildRecord());

      const actual = await service.updateProfile({ logoStorageKey: null }, actor);

      expect(clinicProfileRepositoryMock.updateProfile).toHaveBeenCalledWith(
        'f0e1d2c3-4b5a-4988-9776-655443322110',
        { logoStorageKey: null, logoMimeType: null },
      );
      expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledWith({
        key: PREVIOUS_STORED_KEY,
      });
      expect(actual.hasLogo).toBe(false);
    });

    it('survives a failed cleanup of the replaced object rather than failing a committed save', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(
        buildRecord({ logoStorageKey: PREVIOUS_STORED_KEY, logoMimeType: 'image/png' }),
      );
      clinicProfileRepositoryMock.updateProfile.mockResolvedValue(buildRecord());
      objectStorageServiceMock.deleteObject.mockRejectedValueOnce(new Error('bucket unavailable'));

      await expect(service.updateProfile({ logoStorageKey: null }, actor)).resolves.toMatchObject({
        hasLogo: false,
      });
    });

    it('deletes and audits a staged object whose bytes are not the type it declared', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      // A renamed executable, uploaded under an image/png declaration.
      stageUploadedLogo(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'image/png');

      await expect(service.updateProfile({ logoStorageKey: STAGED_KEY }, actor)).rejects.toThrow(
        'does not start with a PNG signature',
      );
      expect(objectStorageServiceMock.deleteObject).toHaveBeenCalledWith({ key: STAGED_KEY });
      expect(objectStorageServiceMock.uploadObject).not.toHaveBeenCalled();
      expect(clinicProfileRepositoryMock.updateProfile).not.toHaveBeenCalled();
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_UPLOAD_REJECTED',
          resource: 'clinic-profile',
          actorUserId: actor.sub,
        }),
      );
    });

    it('refuses a staged object larger than the surface allows, before reading its bytes', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      objectStorageServiceMock.headObject.mockResolvedValue({
        key: STAGED_KEY,
        sizeBytes: 8 * 1024 * 1024,
        contentType: 'image/png',
      });

      await expect(service.updateProfile({ logoStorageKey: STAGED_KEY }, actor)).rejects.toThrow(
        'larger than the permitted size',
      );
      expect(objectStorageServiceMock.getObject).not.toHaveBeenCalled();
    });

    it('refuses an empty staged object', async () => {
      clinicProfileRepositoryMock.findProfile.mockResolvedValue(buildRecord());
      objectStorageServiceMock.headObject.mockResolvedValue({
        key: STAGED_KEY,
        sizeBytes: 0,
        contentType: 'image/png',
      });

      await expect(
        service.updateProfile({ logoStorageKey: STAGED_KEY }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
