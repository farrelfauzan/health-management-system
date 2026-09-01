import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { resolveDefaultTemplateSettings } from '@hms/shared-types';

import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentTemplateRepository } from './document-template.repository';

/**
 * `P16-T05` through the repository against real PostgreSQL, because the three
 * things worth proving here only exist in the database: that publishing cuts
 * a row later edits cannot reach, that two concurrent publishes cannot mint
 * the same version number, and that the hand-written partial unique index —
 * not the service — is what keeps "exactly one default per kind" true under
 * a race.
 *
 * The suite touches the kind-wide INVOICE default: any pre-existing default
 * is recorded in `beforeAll` and restored in `afterAll`, and every fixture
 * row is removed.
 */
describe('Document template lifecycle against PostgreSQL', () => {
  const suffix = randomUUID();

  let prisma: PrismaService;
  let repository: DocumentTemplateRepository;
  let preExistingDefaultId: string | null = null;
  const templateIds: string[] = [];

  async function createTemplate(name: string): Promise<string> {
    const record = await repository.createTemplate({
      kind: 'INVOICE',
      name: `${name}-${suffix}`,
      contentHtml: '<p>v1</p>',
      settings: resolveDefaultTemplateSettings(),
      createdById: await resolveAnyUserId(),
    });
    templateIds.push(record.id);
    return record.id;
  }

  async function resolveAnyUserId(): Promise<string> {
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (user === null) {
      throw new Error('The dev database has no users to attribute fixtures to');
    }
    return user.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new DocumentTemplateRepository(prisma);
    const preExistingDefault = await prisma.documentTemplate.findFirst({
      where: { kind: 'INVOICE', isDefault: true, deletedAt: null },
      select: { id: true },
    });
    preExistingDefaultId = preExistingDefault?.id ?? null;
  });

  afterAll(async () => {
    await prisma.documentTemplateVersion.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.documentTemplate.deleteMany({ where: { id: { in: templateIds } } });
    if (preExistingDefaultId !== null) {
      await prisma.documentTemplate.update({
        where: { id: preExistingDefaultId },
        data: { isDefault: true },
      });
    }
    await prisma.$disconnect();
  });

  it('keeps a published version byte-identical after the working copy is edited', async () => {
    const templateId = await createTemplate('immutability');

    const published = await repository.publishTemplate({
      templateId,
      publishedById: await resolveAnyUserId(),
    });
    await repository.updateTemplate({ id: templateId, contentHtml: '<p>v2 rewrite</p>' });

    const versionRow = await prisma.documentTemplateVersion.findUniqueOrThrow({
      where: { id: published.version.id },
    });
    expect(versionRow.contentHtml).toBe('<p>v1</p>');
    const workingCopy = await repository.findById(templateId);
    expect(workingCopy?.contentHtml).toBe('<p>v2 rewrite</p>');
    expect(workingCopy?.latestPublishedVersion?.id).toBe(published.version.id);
  });

  it('never mints the same version number for two concurrent publishes', async () => {
    const templateId = await createTemplate('publish-race');
    const publishedById = await resolveAnyUserId();

    const outcomes = await Promise.allSettled([
      repository.publishTemplate({ templateId, publishedById }),
      repository.publishTemplate({ templateId, publishedById }),
    ]);

    const versions = await prisma.documentTemplateVersion.findMany({
      where: { templateId },
      select: { versionNumber: true },
    });
    const versionNumbers = versions.map((version) => version.versionNumber);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
  });

  it('ends a concurrent set-default race with exactly one live default', async () => {
    const firstId = await createTemplate('race-a');
    const secondId = await createTemplate('race-b');
    const publishedById = await resolveAnyUserId();
    await repository.publishTemplate({ templateId: firstId, publishedById });
    await repository.publishTemplate({ templateId: secondId, publishedById });

    const outcomes = await Promise.allSettled([
      repository.setDefaultTemplate(firstId, 'INVOICE'),
      repository.setDefaultTemplate(secondId, 'INVOICE'),
    ]);

    const liveDefaults = await prisma.documentTemplate.count({
      where: { kind: 'INVOICE', isDefault: true, deletedAt: null },
    });
    expect(liveDefaults).toBe(1);
    expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
  });

  it('lets the partial unique index refuse a second default written behind the service', async () => {
    const firstId = await createTemplate('index-a');
    const secondId = await createTemplate('index-b');
    await repository.setDefaultTemplate(firstId, 'INVOICE');

    await expect(
      prisma.documentTemplate.update({ where: { id: secondId }, data: { isDefault: true } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
