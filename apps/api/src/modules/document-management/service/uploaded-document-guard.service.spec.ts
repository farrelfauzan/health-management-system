import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { AuditService } from '../../../common/audit/audit.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { UploadedDocumentGuardService } from './uploaded-document-guard.service';

const STORAGE_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf';
const IMAGE_STORAGE_KEY = 'documents/clinic/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.jpg';
const ACTOR_USER_ID = 'a3c9b2e1-4d5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('UploadedDocumentGuardService', () => {
  let mockObjectStorageService: jest.Mocked<ObjectStorageService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let guardService: UploadedDocumentGuardService;

  async function buildScan(
    format: 'jpeg' | 'png' | 'webp',
    widthPixels = 1200,
    heightPixels = 1600,
  ): Promise<Buffer> {
    const image = sharp({
      create: {
        width: widthPixels,
        height: heightPixels,
        channels: 3,
        background: { r: 245, g: 245, b: 240 },
      },
    });
    return (
      format === 'jpeg' ? image.jpeg() : format === 'webp' ? image.webp() : image.png()
    ).toBuffer();
  }

  beforeEach(() => {
    mockObjectStorageService = {
      getObject: jest.fn(),
      uploadObject: jest.fn().mockResolvedValue({ key: IMAGE_STORAGE_KEY }),
      deleteObject: jest.fn().mockResolvedValue({ key: STORAGE_KEY, deleted: true }),
    } as unknown as jest.Mocked<ObjectStorageService>;
    mockAuditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    guardService = new UploadedDocumentGuardService(mockObjectStorageService, mockAuditService);
  });

  it('leaves a text document untouched and reports its stored size', async () => {
    const content = Buffer.from('%PDF-1.4\ntrailer << /Root 1 0 R >>\n%%EOF', 'ascii');
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: content,
      contentType: 'application/pdf',
    });

    const actual = await guardService.guardUploadedDocument({
      storageKey: STORAGE_KEY,
      declaredMimeType: 'application/pdf',
      actorUserId: ACTOR_USER_ID,
    });

    expect(actual).toEqual({ sizeBytes: content.byteLength });
    expect(mockObjectStorageService.uploadObject).not.toHaveBeenCalled();
    expect(mockObjectStorageService.deleteObject).not.toHaveBeenCalled();
    expect(mockAuditService.record).not.toHaveBeenCalled();
  });

  it('deletes the object, audits, and rejects when the bytes disagree', async () => {
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: Buffer.concat([Buffer.from('MZ', 'ascii'), Buffer.alloc(62, 0)]),
      contentType: 'application/pdf',
    });

    await expect(
      guardService.guardUploadedDocument({
        storageKey: STORAGE_KEY,
        declaredMimeType: 'application/pdf',
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockObjectStorageService.deleteObject).toHaveBeenCalledWith({ key: STORAGE_KEY });
    expect(mockAuditService.record).toHaveBeenCalledWith({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      resource: 'document',
      actorUserId: ACTOR_USER_ID,
      metadata: {
        storageKey: STORAGE_KEY,
        declaredMimeType: 'application/pdf',
        reason: expect.stringContaining('PDF signature'),
      },
    });
  });

  it('deletes before answering, so a retried confirm cannot eventually be believed', async () => {
    const callOrder: string[] = [];
    mockObjectStorageService.getObject.mockResolvedValue({
      key: STORAGE_KEY,
      body: Buffer.from([0x00, 0x01, 0x02]),
      contentType: 'text/plain',
    });
    mockObjectStorageService.deleteObject.mockImplementation(async () => {
      callOrder.push('delete');
      return { key: STORAGE_KEY, deleted: true };
    });
    mockAuditService.record.mockImplementation(async () => {
      callOrder.push('audit');
    });

    await expect(
      guardService.guardUploadedDocument({
        storageKey: STORAGE_KEY,
        declaredMimeType: 'text/plain',
        actorUserId: ACTOR_USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(callOrder).toEqual(['delete', 'audit']);
  });

  describe('images (P16-T03)', () => {
    it.each(['jpeg', 'png', 'webp'] as const)(
      'replaces a stored %s with its own re-encode, keeping the format',
      async (format) => {
        const uploaded = await buildScan(format);
        mockObjectStorageService.getObject.mockResolvedValue({
          key: IMAGE_STORAGE_KEY,
          body: uploaded,
          contentType: `image/${format}`,
        });

        const actual = await guardService.guardUploadedDocument({
          storageKey: IMAGE_STORAGE_KEY,
          declaredMimeType: `image/${format}`,
          actorUserId: ACTOR_USER_ID,
        });

        const stored = mockObjectStorageService.uploadObject.mock.calls[0]?.[0] as {
          key: string;
          body: Buffer;
          contentType: string;
        };
        // Same key: the row already points at it, and the object it points at
        // must be the one this process produced.
        expect(stored.key).toBe(IMAGE_STORAGE_KEY);
        expect(stored.contentType).toBe(`image/${format}`);
        expect(uploaded.equals(stored.body)).toBe(false);
        expect(await sharp(stored.body).metadata()).toMatchObject({ format });
        // The row records what is in the bucket now, not what was uploaded.
        expect(actual.sizeBytes).toBe(stored.body.byteLength);
      },
    );

    it('keeps the scan at full resolution', async () => {
      // The point of a 300 dpi scan is that the small print is readable; a
      // thumbnail of a radiology report is not a radiology report.
      const uploaded = await buildScan('jpeg', 2400, 3200);
      mockObjectStorageService.getObject.mockResolvedValue({
        key: IMAGE_STORAGE_KEY,
        body: uploaded,
        contentType: 'image/jpeg',
      });

      await guardService.guardUploadedDocument({
        storageKey: IMAGE_STORAGE_KEY,
        declaredMimeType: 'image/jpeg',
        actorUserId: ACTOR_USER_ID,
      });

      const stored = mockObjectStorageService.uploadObject.mock.calls[0]?.[0] as { body: Buffer };
      expect(await sharp(stored.body).metadata()).toMatchObject({ width: 2400, height: 3200 });
    });

    it('strips EXIF and GPS from a phone photo before it is stored', async () => {
      // The reason images can be accepted at all: a photographed referral
      // letter carries the coordinates of wherever it was photographed.
      // sharp maps IFD3 to the GPS IFD, so this fixture carries real
      // coordinates alongside an ordinary IFD0 tag.
      const uploaded = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .withExif({
          IFD0: { Copyright: 'Klinik' },
          IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 30/1' },
        })
        .jpeg()
        .toBuffer();
      expect((await sharp(uploaded).metadata()).exif).toBeDefined();
      mockObjectStorageService.getObject.mockResolvedValue({
        key: IMAGE_STORAGE_KEY,
        body: uploaded,
        contentType: 'image/jpeg',
      });

      await guardService.guardUploadedDocument({
        storageKey: IMAGE_STORAGE_KEY,
        declaredMimeType: 'image/jpeg',
        actorUserId: ACTOR_USER_ID,
      });

      const stored = mockObjectStorageService.uploadObject.mock.calls[0]?.[0] as { body: Buffer };
      expect((await sharp(stored.body).metadata()).exif).toBeUndefined();
    });

    it('destroys a polyglot rather than storing the bytes that carried it', async () => {
      // A JPEG with a PHP payload appended is a valid JPEG and a valid script.
      // Only the pixels survive a decode-and-rewrite.
      const payload = Buffer.from('<?php system($_GET["c"]); ?>', 'ascii');
      const polyglot = Buffer.concat([await buildScan('jpeg', 32, 32), payload]);
      mockObjectStorageService.getObject.mockResolvedValue({
        key: IMAGE_STORAGE_KEY,
        body: polyglot,
        contentType: 'image/jpeg',
      });

      await guardService.guardUploadedDocument({
        storageKey: IMAGE_STORAGE_KEY,
        declaredMimeType: 'image/jpeg',
        actorUserId: ACTOR_USER_ID,
      });

      const stored = mockObjectStorageService.uploadObject.mock.calls[0]?.[0] as { body: Buffer };
      expect(stored.body.includes(payload)).toBe(false);
      expect(polyglot.includes(payload)).toBe(true);
    });

    it('rejects an executable renamed as an image, deleting it and never storing anything', async () => {
      mockObjectStorageService.getObject.mockResolvedValue({
        key: IMAGE_STORAGE_KEY,
        body: Buffer.concat([Buffer.from('MZ', 'ascii'), Buffer.alloc(62, 0)]),
        contentType: 'image/png',
      });

      await expect(
        guardService.guardUploadedDocument({
          storageKey: IMAGE_STORAGE_KEY,
          declaredMimeType: 'image/png',
          actorUserId: ACTOR_USER_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockObjectStorageService.uploadObject).not.toHaveBeenCalled();
      expect(mockObjectStorageService.deleteObject).toHaveBeenCalledWith({
        key: IMAGE_STORAGE_KEY,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DOCUMENT_UPLOAD_REJECTED' }),
      );
    });

    it('rejects an image whose signature is right but whose body no decoder can read', async () => {
      // Past the magic-byte gate, refused by the re-encode — which is why the
      // gate is not the defence.
      mockObjectStorageService.getObject.mockResolvedValue({
        key: IMAGE_STORAGE_KEY,
        body: Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.alloc(128, 0x41),
        ]),
        contentType: 'image/png',
      });

      await expect(
        guardService.guardUploadedDocument({
          storageKey: IMAGE_STORAGE_KEY,
          declaredMimeType: 'image/png',
          actorUserId: ACTOR_USER_ID,
        }),
      ).rejects.toThrow('could not be decoded');

      expect(mockObjectStorageService.uploadObject).not.toHaveBeenCalled();
      expect(mockObjectStorageService.deleteObject).toHaveBeenCalledWith({
        key: IMAGE_STORAGE_KEY,
      });
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DOCUMENT_UPLOAD_REJECTED',
          metadata: expect.objectContaining({ reason: 'Uploaded image could not be decoded' }),
        }),
      );
    });
  });
});
