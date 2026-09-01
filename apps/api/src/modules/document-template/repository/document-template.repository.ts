import { Injectable } from '@nestjs/common';

import {
  CreateDocumentTemplateRecordPayload,
  DocumentTemplateKindValue,
  DocumentTemplateRecord,
  DocumentTemplateVersionRecord,
  DocumentTemplateWithLatestVersionRecord,
  PublishDocumentTemplateRecordPayload,
  UpdateDocumentTemplateRecordPayload,
  templateSettingsSchema,
} from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentTemplate, DocumentTemplateVersion, Prisma } from '../../../generated/prisma/client';

type TemplateRowWithVersions = DocumentTemplate & { versions: DocumentTemplateVersion[] };

const LATEST_VERSION_INCLUDE = {
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
};

/**
 * Persistence for document templates and their published versions (P16-T05).
 *
 * `settings` is parsed through `templateSettingsSchema` at this boundary so
 * no raw Json escapes into the domain — the Decimal-to-number rule applied to
 * Json columns. Version rows are only ever inserted; nothing here exposes a
 * way to update one.
 */
@Injectable()
export class DocumentTemplateRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listByKind(
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateWithLatestVersionRecord[]> {
    const rows = await this.prismaService.documentTemplate.findMany({
      where: { kind, deletedAt: null },
      include: LATEST_VERSION_INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toRecordWithLatestVersion(row));
  }

  async findById(id: string): Promise<DocumentTemplateWithLatestVersionRecord | null> {
    const row = await this.prismaService.documentTemplate.findFirst({
      where: { id, deletedAt: null },
      include: LATEST_VERSION_INCLUDE,
    });
    return row === null ? null : this.toRecordWithLatestVersion(row);
  }

  async createTemplate(
    payload: CreateDocumentTemplateRecordPayload,
  ): Promise<DocumentTemplateRecord> {
    const row = await this.prismaService.documentTemplate.create({
      data: {
        kind: payload.kind,
        name: payload.name,
        description: payload.description,
        contentHtml: payload.contentHtml,
        settings: payload.settings,
        createdById: payload.createdById,
      },
    });
    return this.toRecord(row);
  }

  async updateTemplate(
    payload: UpdateDocumentTemplateRecordPayload,
  ): Promise<DocumentTemplateWithLatestVersionRecord> {
    const row = await this.prismaService.documentTemplate.update({
      where: { id: payload.id },
      data: {
        name: payload.name,
        description: payload.description,
        contentHtml: payload.contentHtml,
        settings: payload.settings,
      },
      include: LATEST_VERSION_INCLUDE,
    });
    return this.toRecordWithLatestVersion(row);
  }

  /**
   * Cuts the next immutable version inside one transaction: the working copy
   * is re-read transactionally, the next number is `max + 1`, and the status
   * flips to PUBLISHED. Two concurrent publishes both computing the same
   * number resolve at the `(templateId, versionNumber)` unique index — the
   * loser surfaces as a unique-constraint error for the service to translate.
   */
  async publishTemplate(payload: PublishDocumentTemplateRecordPayload): Promise<{
    template: DocumentTemplateRecord;
    version: DocumentTemplateVersionRecord;
  }> {
    return this.prismaService.executeTransaction(async (tx) => {
      const template = await tx.documentTemplate.findUniqueOrThrow({
        where: { id: payload.templateId },
      });
      const latest = await tx.documentTemplateVersion.aggregate({
        where: { templateId: payload.templateId },
        _max: { versionNumber: true },
      });
      const nextVersionNumber = (latest._max.versionNumber ?? 0) + 1;
      const version = await tx.documentTemplateVersion.create({
        data: {
          templateId: payload.templateId,
          versionNumber: nextVersionNumber,
          contentHtml: template.contentHtml,
          settings: template.settings as Prisma.InputJsonValue,
          publishedById: payload.publishedById,
        },
      });
      const published = await tx.documentTemplate.update({
        where: { id: payload.templateId },
        data: { status: 'PUBLISHED' },
      });
      return { template: this.toRecord(published), version: this.toVersionRecord(version) };
    });
  }

  /**
   * Swaps the default flag transactionally: every other live default of the
   * kind is cleared before this one is set. The partial unique index in the
   * migration is the backstop for two racing swaps — the second commit fails
   * there rather than leaving two defaults.
   */
  async setDefaultTemplate(
    id: string,
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateWithLatestVersionRecord> {
    return this.prismaService.executeTransaction(async (tx) => {
      await tx.documentTemplate.updateMany({
        where: { kind, isDefault: true, deletedAt: null, id: { not: id } },
        data: { isDefault: false },
      });
      const row = await tx.documentTemplate.update({
        where: { id },
        data: { isDefault: true },
        include: LATEST_VERSION_INCLUDE,
      });
      return this.toRecordWithLatestVersion(row);
    });
  }

  async archiveTemplate(id: string, archivedAt: Date): Promise<DocumentTemplateRecord> {
    const row = await this.prismaService.documentTemplate.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: archivedAt },
    });
    return this.toRecord(row);
  }

  async findLatestPublishedVersionByKind(
    kind: DocumentTemplateKindValue,
  ): Promise<DocumentTemplateVersionRecord | null> {
    const defaultTemplate = await this.prismaService.documentTemplate.findFirst({
      where: { kind, isDefault: true, deletedAt: null },
      include: LATEST_VERSION_INCLUDE,
    });
    const latest = defaultTemplate?.versions[0];
    return latest === undefined ? null : this.toVersionRecord(latest);
  }

  private toRecordWithLatestVersion(
    row: TemplateRowWithVersions,
  ): DocumentTemplateWithLatestVersionRecord {
    const latest = row.versions[0];
    return {
      ...this.toRecord(row),
      latestPublishedVersion: latest === undefined ? null : this.toVersionRecord(latest),
    };
  }

  private toRecord(row: DocumentTemplate): DocumentTemplateRecord {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      status: row.status,
      isDefault: row.isDefault,
      contentHtml: row.contentHtml,
      settings: templateSettingsSchema.parse(row.settings),
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toVersionRecord(row: DocumentTemplateVersion): DocumentTemplateVersionRecord {
    return {
      id: row.id,
      templateId: row.templateId,
      versionNumber: row.versionNumber,
      contentHtml: row.contentHtml,
      settings: templateSettingsSchema.parse(row.settings),
      publishedById: row.publishedById,
      publishedAt: row.publishedAt,
    };
  }
}
