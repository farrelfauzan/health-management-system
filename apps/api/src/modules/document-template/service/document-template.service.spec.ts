import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  DocumentTemplateRecord,
  DocumentTemplateVersionRecord,
  DocumentTemplateWithLatestVersionRecord,
  resolveDefaultTemplateSettings,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { DocumentTemplateRepository } from '../repository/document-template.repository';
import { DocumentTemplateMapper } from './document-template.mapper';
import { DocumentTemplateService } from './document-template.service';

describe('DocumentTemplateService', () => {
  const actor = { sub: 'admin-user', email: 'admin@hms.local' } as CurrentUser;

  const repositoryMock = {
    listByKind: jest.fn(),
    findById: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    publishTemplate: jest.fn(),
    setDefaultTemplate: jest.fn(),
    archiveTemplate: jest.fn(),
    findLatestPublishedVersionByKind: jest.fn(),
  };
  const auditServiceMock = { record: jest.fn(), recordOrThrow: jest.fn() };

  const service = new DocumentTemplateService(
    repositoryMock as unknown as DocumentTemplateRepository,
    new DocumentTemplateMapper(),
    auditServiceMock as unknown as AuditService,
  );

  function buildRecord(overrides: Partial<DocumentTemplateRecord> = {}): DocumentTemplateRecord {
    return {
      id: 'template-1',
      kind: 'INVOICE',
      name: 'Kuitansi A5',
      description: null,
      status: 'DRAFT',
      isDefault: false,
      contentHtml: '<p>Total</p>',
      settings: resolveDefaultTemplateSettings(),
      createdById: 'admin-user',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...overrides,
    };
  }

  function buildVersion(
    overrides: Partial<DocumentTemplateVersionRecord> = {},
  ): DocumentTemplateVersionRecord {
    return {
      id: 'version-1',
      templateId: 'template-1',
      versionNumber: 1,
      contentHtml: '<p>Total</p>',
      settings: resolveDefaultTemplateSettings(),
      publishedById: 'admin-user',
      publishedAt: new Date('2026-09-01T01:00:00Z'),
      ...overrides,
    };
  }

  function buildRecordWithVersion(
    record: Partial<DocumentTemplateRecord> = {},
    latestPublishedVersion: DocumentTemplateVersionRecord | null = null,
  ): DocumentTemplateWithLatestVersionRecord {
    return { ...buildRecord(record), latestPublishedVersion };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sanitises the HTML before storing a new template', async () => {
    repositoryMock.createTemplate.mockImplementation((payload) =>
      Promise.resolve(buildRecord({ contentHtml: payload.contentHtml })),
    );

    await service.createTemplate(
      {
        kind: 'INVOICE',
        name: 'Kuitansi',
        contentHtml: '<p>ok</p><script>alert(1)</script>',
        settings: resolveDefaultTemplateSettings(),
      },
      actor,
    );

    const storedPayload = repositoryMock.createTemplate.mock.calls[0][0];
    expect(storedPayload.contentHtml).toBe('<p>ok</p>');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', resource: 'document-template' }),
    );
  });

  it('sanitises the HTML on update and leaves absent fields alone', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion());
    repositoryMock.updateTemplate.mockResolvedValue(buildRecordWithVersion());

    await service.updateTemplate(
      'template-1',
      { contentHtml: '<p onclick="x()">a</p>' },
      actor,
    );

    const updatePayload = repositoryMock.updateTemplate.mock.calls[0][0];
    expect(updatePayload.contentHtml).toBe('<p>a</p>');
    expect(updatePayload.name).toBeUndefined();
  });

  it('refuses to publish a blank template', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion({ contentHtml: '  ' }));

    await expect(service.publishTemplate('template-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repositoryMock.publishTemplate).not.toHaveBeenCalled();
  });

  it('translates a concurrent publish into a conflict', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion());
    repositoryMock.publishTemplate.mockRejectedValue({ code: 'P2002' });

    await expect(service.publishTemplate('template-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('publishes through the repository and reports the new version', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion());
    repositoryMock.publishTemplate.mockResolvedValue({
      template: buildRecord({ status: 'PUBLISHED' }),
      version: buildVersion({ versionNumber: 4 }),
    });

    const actualView = await service.publishTemplate('template-1', actor);

    expect(repositoryMock.publishTemplate).toHaveBeenCalledWith({
      templateId: 'template-1',
      publishedById: 'admin-user',
    });
    expect(actualView.status).toBe('PUBLISHED');
    expect(actualView.latestPublishedVersion?.versionNumber).toBe(4);
  });

  it('refuses to make a never-published template the default', async () => {
    // The render service resolves "the default template's latest published
    // version" — a default with no version would silently push every invoice
    // onto the built-in fallback.
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion());

    await expect(service.setDefaultTemplate('template-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repositoryMock.setDefaultTemplate).not.toHaveBeenCalled();
  });

  it('swaps the default for a published template', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion({}, buildVersion()));
    repositoryMock.setDefaultTemplate.mockResolvedValue(
      buildRecordWithVersion({ isDefault: true, status: 'PUBLISHED' }, buildVersion()),
    );

    const actualView = await service.setDefaultTemplate('template-1', actor);

    expect(repositoryMock.setDefaultTemplate).toHaveBeenCalledWith('template-1', 'INVOICE');
    expect(actualView.isDefault).toBe(true);
  });

  it('refuses to archive the default template', async () => {
    repositoryMock.findById.mockResolvedValue(
      buildRecordWithVersion({ isDefault: true }, buildVersion()),
    );

    await expect(service.archiveTemplate('template-1', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repositoryMock.archiveTemplate).not.toHaveBeenCalled();
  });

  it('archives a non-default template and reports when', async () => {
    repositoryMock.findById.mockResolvedValue(buildRecordWithVersion());
    repositoryMock.archiveTemplate.mockResolvedValue(buildRecord({ status: 'ARCHIVED' }));

    const actualView = await service.archiveTemplate('template-1', actor);

    expect(actualView.id).toBe('template-1');
    expect(typeof actualView.archivedAt).toBe('string');
    expect(auditServiceMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', resource: 'document-template' }),
    );
  });

  it('reports not-found for a missing template on every mutating path', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(service.updateTemplate('missing', { name: 'x' }, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.publishTemplate('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setDefaultTemplate('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.archiveTemplate('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
