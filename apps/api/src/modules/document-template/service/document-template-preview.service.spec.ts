import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DocumentTemplateWithLatestVersionRecord,
  resolveDefaultTemplateSettings,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { PdfRendererService } from '../../../common/pdf/pdf-renderer.service';
import { ObjectStorageService } from '../../../common/storage/object-storage.service';
import { INVOICE_DOCUMENT_STORAGE_KEY_PREFIX } from '../../billing/service/invoice-document-storage-key-prefix';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import {
  DocumentTemplatePreviewService,
  TEMPLATE_PREVIEW_STORAGE_KEY_PREFIX,
} from './document-template-preview.service';

describe('DocumentTemplatePreviewService', () => {
  const actor = { sub: 'admin-user', email: 'admin@hms.local' } as CurrentUser;
  const repositoryMock = {
    findById: jest.fn(),
    publishTemplate: jest.fn(),
    updateTemplate: jest.fn(),
  };
  const rendererMock = { render: jest.fn() };
  const storageMock = {
    generateObjectKey: jest.fn(),
    uploadObject: jest.fn(),
    getSignedUrl: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };
  const configServiceMock = { get: jest.fn() };

  const service = new DocumentTemplatePreviewService(
    repositoryMock as unknown as DocumentTemplateRepository,
    rendererMock as unknown as PdfRendererService,
    storageMock as unknown as ObjectStorageService,
    auditServiceMock as unknown as AuditService,
    configServiceMock as unknown as ConfigService,
  );

  function buildTemplate(contentHtml: string): DocumentTemplateWithLatestVersionRecord {
    return {
      id: 'template-1',
      kind: 'INVOICE',
      name: 'Kuitansi',
      description: null,
      status: 'DRAFT',
      isDefault: false,
      contentHtml,
      settings: { ...resolveDefaultTemplateSettings(), itemsColumns: ['item.description', 'item.amount'] },
      createdById: 'admin-user',
      createdAt: new Date(),
      updatedAt: new Date(),
      latestPublishedVersion: null,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configServiceMock.get.mockReturnValue(undefined);
    rendererMock.render.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    storageMock.generateObjectKey.mockImplementation(
      (request: { keyPrefix: string }) => `${request.keyPrefix}/generated.pdf`,
    );
    storageMock.uploadObject.mockResolvedValue({ key: 'ignored' });
    storageMock.getSignedUrl.mockResolvedValue({
      url: 'https://objects.example/preview.pdf?sig=1',
      expiresAt: '2026-09-01T05:05:00.000Z',
    });
  });

  it('renders the draft against the fixture and returns a short-lived inline URL', async () => {
    repositoryMock.findById.mockResolvedValue(
      buildTemplate(
        '<h1><span data-hms-var="patient.fullName"></span></h1><div data-hms-var="items"></div>',
      ),
    );

    const actual = await service.previewTemplate('template-1', actor);

    expect(actual.url).toBe('https://objects.example/preview.pdf?sig=1');
    expect(actual.expiresAt).toBe('2026-09-01T05:05:00.000Z');
    const [renderedHtml] = rendererMock.render.mock.calls[0] as [string];
    // The hostile fixture went in: 120-char name, 12 rows, the materai area,
    // and only the configured item columns.
    expect(renderedHtml.match(/<tbody>(.*)<\/tbody>/s)?.[1]?.match(/<tr>/g)).toHaveLength(12);
    expect(renderedHtml).toContain('hms-materai-box');
    expect(renderedHtml).toContain('<thead><tr><th>Uraian</th><th>Jumlah</th></tr></thead>');
    expect(renderedHtml).toContain('Rp 0');
    expect(storageMock.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresInSeconds: 300,
        responseContentDisposition: expect.stringMatching(/^inline;/),
        responseContentType: 'application/pdf',
      }),
    );
  });

  it('writes under the preview prefix, never the invoice document store', async () => {
    repositoryMock.findById.mockResolvedValue(buildTemplate('<p>x</p>'));

    await service.previewTemplate('template-1', actor);

    const [uploadRequest] = storageMock.uploadObject.mock.calls[0] as [{ key: string }];
    expect(uploadRequest.key.startsWith(TEMPLATE_PREVIEW_STORAGE_KEY_PREFIX)).toBe(true);
    expect(uploadRequest.key.startsWith(INVOICE_DOCUMENT_STORAGE_KEY_PREFIX)).toBe(false);
    expect(repositoryMock.publishTemplate).not.toHaveBeenCalled();
    expect(repositoryMock.updateTemplate).not.toHaveBeenCalled();
  });

  it('reports fixture warnings so a blank is explained before publish (FR-E1-08)', async () => {
    repositoryMock.findById.mockResolvedValue(
      buildTemplate('<p><span data-hms-var="clinic.logo"></span></p>'),
    );

    const actual = await service.previewTemplate('template-1', actor);

    expect(actual.warnings.some((warning) => warning.token === 'clinic.logo')).toBe(true);
    expect(rendererMock.render).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown template before touching the renderer', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(service.previewTemplate('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rendererMock.render).not.toHaveBeenCalled();
  });
});
