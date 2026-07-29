import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  BPJS_KEYWORD_REFERENCE_CATALOGS,
  BpjsReferenceCatalogStatusView,
  BpjsReferenceCatalogValue,
  BpjsReferenceItemData,
  BpjsReferenceItemRecord,
  BpjsReferenceItemView,
  BpjsReferenceSyncCatalogResultView,
  BpjsReferenceSyncResultView,
  SearchBpjsReferenceQueryInput,
  SearchBpjsReferenceRemoteInput,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsPcareHttpClient } from '../../../common/bpjs-pcare/bpjs-pcare-http.client';
import { BPJS_PCARE_REFERENCE_CATALOGS } from '../../../common/bpjs-pcare/bpjs-pcare-reference-catalogs';
import { BpjsPcareReferenceCatalogDescriptor } from '../../../common/bpjs-pcare/bpjs-pcare-reference.types';
import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcareConnection } from '../../../common/bpjs-pcare/bpjs-pcare.types';
import { parseBpjsPcareReferenceList } from '../../../common/bpjs-pcare/parse-bpjs-pcare-reference-list';
import { BpjsPcareConfigRepository } from '../repository/bpjs-pcare-config.repository';
import { BpjsReferenceRepository } from '../repository/bpjs-reference.repository';

const BPJS_REFERENCE_AUDIT_RESOURCE = 'BpjsReferenceItem';
const SYNC_PAGE_SIZE = 100;
const MAX_SYNC_PAGES_PER_SOURCE = 50;
const REMOTE_SEARCH_LIMIT = 50;
const SYNCABLE_CATALOGS: readonly BpjsReferenceCatalogValue[] = [
  'POLI',
  'DOKTER',
  'KESADARAN',
  'TINDAKAN',
  'SPESIALIS',
  'SARANA',
];

/**
 * Syncs the PCare reference catalogs into local tables (P11-T03) so
 * dropdowns and mapping screens never make live BPJS calls. The six
 * enumerable catalogs are replaced wholesale by the admin sync button; the
 * keyword-only catalogs (DIAGNOSA, DPHO) are populated incrementally by
 * search-and-cache. Upstream failures surface as 502 with BPJS's readable
 * reason — a failed sync never leaves a catalog half-replaced because the
 * replace is transactional per catalog.
 */
@Injectable()
export class BpjsReferenceService {
  constructor(
    private readonly configRepository: BpjsPcareConfigRepository,
    private readonly referenceRepository: BpjsReferenceRepository,
    private readonly httpClient: BpjsPcareHttpClient,
    private readonly auditService: AuditService,
  ) {}

  async syncCatalogs(actor: CurrentUser): Promise<BpjsReferenceSyncResultView> {
    const connection = await this.requireConnection();
    const syncedAt = new Date();
    const catalogResults: BpjsReferenceSyncCatalogResultView[] = [];
    for (const catalog of SYNCABLE_CATALOGS) {
      const items = await this.fetchWholeCatalog(connection, BPJS_PCARE_REFERENCE_CATALOGS[catalog]);
      const itemCount = await this.referenceRepository.replaceCatalog({
        catalog,
        syncedAt,
        items,
      });
      catalogResults.push({ catalog, itemCount });
    }
    await this.auditService.record({
      action: 'BPJS_REFERENCE_SYNCED',
      resource: BPJS_REFERENCE_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: {
        mode: 'BULK',
        catalogs: Object.fromEntries(
          catalogResults.map((result) => [result.catalog, result.itemCount]),
        ),
      },
    });
    return { syncedAt: syncedAt.toISOString(), catalogs: catalogResults };
  }

  async searchLocal(
    catalog: BpjsReferenceCatalogValue,
    query: SearchBpjsReferenceQueryInput,
  ): Promise<BpjsReferenceItemView[]> {
    const records = await this.referenceRepository.searchCatalog({
      catalog,
      search: query.search,
      limit: query.limit,
    });
    return records.map((record) => this.toView(record));
  }

  async searchRemote(
    catalog: BpjsReferenceCatalogValue,
    input: SearchBpjsReferenceRemoteInput,
    actor: CurrentUser,
  ): Promise<BpjsReferenceItemView[]> {
    const descriptor = BPJS_PCARE_REFERENCE_CATALOGS[catalog];
    if (descriptor.fetchPlan.kind !== 'KEYWORD') {
      throw new BadRequestException(
        `Catalog ${catalog} is populated by the bulk sync, not by keyword search`,
      );
    }
    const connection = await this.requireConnection();
    const syncedAt = new Date();
    const path = descriptor.fetchPlan.buildPath(input.query, 0, REMOTE_SEARCH_LIMIT);
    const page = await this.fetchReferencePage(connection, descriptor, path);
    if (page.entries.length > 0) {
      await this.referenceRepository.upsertItems({
        catalog,
        syncedAt,
        items: page.entries.map((entry) => this.toItemData(entry)),
      });
    }
    await this.auditService.record({
      action: 'BPJS_REFERENCE_SYNCED',
      resource: BPJS_REFERENCE_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: { mode: 'KEYWORD', catalog, itemCount: page.entries.length },
    });
    return page.entries.map((entry) =>
      this.toView({
        catalog,
        code: entry.code,
        display: entry.display,
        groupCode: entry.groupCode ?? null,
        syncedAt,
      }),
    );
  }

  async getStatus(): Promise<BpjsReferenceCatalogStatusView[]> {
    const statuses = await this.referenceRepository.getCatalogStatuses();
    const keywordCatalogs: readonly string[] = BPJS_KEYWORD_REFERENCE_CATALOGS;
    return statuses.map((status) => ({
      catalog: status.catalog,
      itemCount: status.itemCount,
      lastSyncedAt: status.lastSyncedAt === null ? null : status.lastSyncedAt.toISOString(),
      isSyncable: !keywordCatalogs.includes(status.catalog),
    }));
  }

  private async fetchWholeCatalog(
    connection: BpjsPcareConnection,
    descriptor: BpjsPcareReferenceCatalogDescriptor,
  ): Promise<BpjsReferenceItemData[]> {
    const fetchPlan = descriptor.fetchPlan;
    if (fetchPlan.kind === 'SINGLE') {
      const page = await this.fetchReferencePage(connection, descriptor, fetchPlan.path);
      return page.entries.map((entry) => this.toItemData(entry));
    }
    if (fetchPlan.kind === 'PAGINATED') {
      return this.fetchAllPages(connection, descriptor, (start, limit) =>
        fetchPlan.buildPath(start, limit),
      );
    }
    if (fetchPlan.kind === 'GROUPED_PAGINATED') {
      const items: BpjsReferenceItemData[] = [];
      for (const group of fetchPlan.groups) {
        const groupItems = await this.fetchAllPages(
          connection,
          descriptor,
          (start, limit) => fetchPlan.buildPath(group, start, limit),
          group,
        );
        items.push(...groupItems);
      }
      return items;
    }
    throw new BadRequestException(
      `Catalog ${descriptor.catalog} is populated by keyword search, not by the bulk sync`,
    );
  }

  private async fetchAllPages(
    connection: BpjsPcareConnection,
    descriptor: BpjsPcareReferenceCatalogDescriptor,
    buildPath: (start: number, limit: number) => string,
    groupCode?: string,
  ): Promise<BpjsReferenceItemData[]> {
    const items: BpjsReferenceItemData[] = [];
    for (let pageIndex = 0; pageIndex < MAX_SYNC_PAGES_PER_SOURCE; pageIndex += 1) {
      const path = buildPath(pageIndex * SYNC_PAGE_SIZE, SYNC_PAGE_SIZE);
      const page = await this.fetchReferencePage(connection, descriptor, path, groupCode);
      items.push(...page.entries.map((entry) => this.toItemData(entry)));
      if (this.isLastPage(page.entries.length, page.totalCount, items.length)) {
        return items;
      }
    }
    return items;
  }

  private isLastPage(
    pageEntryCount: number,
    reportedTotal: number | null,
    collectedCount: number,
  ): boolean {
    if (pageEntryCount < SYNC_PAGE_SIZE) {
      return true;
    }
    return reportedTotal !== null && collectedCount >= reportedTotal;
  }

  private async fetchReferencePage(
    connection: BpjsPcareConnection,
    descriptor: BpjsPcareReferenceCatalogDescriptor,
    path: string,
    groupCode?: string,
  ) {
    try {
      const envelope = await this.httpClient.sendRequest(connection, { method: 'GET', path });
      return parseBpjsPcareReferenceList({
        response: envelope.response,
        codeField: descriptor.codeField,
        displayField: descriptor.displayField,
        groupCode,
      });
    } catch (caughtError) {
      throw this.toUpstreamException(caughtError, descriptor.catalog);
    }
  }

  private toUpstreamException(caughtError: unknown, catalog: BpjsReferenceCatalogValue): Error {
    if (!(caughtError instanceof BpjsPcareError)) {
      return caughtError as Error;
    }
    if (caughtError.code === 'BPJS_PCARE_NOT_CONFIGURED') {
      return new ServiceUnavailableException(caughtError.message);
    }
    return new BadGatewayException(
      `BPJS PCare reference sync failed for ${catalog} — ${caughtError.code}: ${caughtError.message}`,
    );
  }

  private async requireConnection(): Promise<BpjsPcareConnection> {
    try {
      const connection = await this.configRepository.getConnection();
      if (connection === null) {
        throw new NotFoundException('BPJS PCare is not configured');
      }
      return connection;
    } catch (caughtError) {
      if (
        caughtError instanceof BpjsPcareError &&
        caughtError.code === 'BPJS_PCARE_NOT_CONFIGURED'
      ) {
        throw new ServiceUnavailableException(caughtError.message);
      }
      throw caughtError;
    }
  }

  private toItemData(entry: {
    code: string;
    display: string;
    groupCode?: string;
  }): BpjsReferenceItemData {
    return { code: entry.code, display: entry.display, groupCode: entry.groupCode ?? null };
  }

  private toView(record: BpjsReferenceItemRecord): BpjsReferenceItemView {
    return {
      catalog: record.catalog,
      code: record.code,
      display: record.display,
      ...(record.groupCode === null ? {} : { groupCode: record.groupCode }),
      syncedAt: record.syncedAt.toISOString(),
    };
  }
}
