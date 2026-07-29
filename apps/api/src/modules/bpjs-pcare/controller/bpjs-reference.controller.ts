import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { BpjsReferenceCatalogValue } from '@hms/shared-types';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { BPJS_PCARE_EXAMPLES } from '../../../common/openapi/bpjs-pcare-examples';
import { BpjsReferenceCatalogParamsDto } from '../dto/bpjs-reference-catalog-params.dto';
import { SearchBpjsReferenceQueryDto } from '../dto/search-bpjs-reference-query.dto';
import { SearchBpjsReferenceRemoteDto } from '../dto/search-bpjs-reference-remote.dto';
import { BpjsReferenceService } from '../service/bpjs-reference.service';

@ApiTags('BPJS PCare')
@Controller({
  version: '1',
  path: 'bpjs/reference',
})
export class BpjsReferenceController {
  constructor(private readonly referenceService: BpjsReferenceService) {}

  @Post('sync')
  @HttpCode(200)
  @Auth([{ action: 'sync', subject: 'BpjsReference' }])
  @ApiEndpoint({
    summary: 'Sync the enumerable BPJS PCare reference catalogs',
    responseDescription:
      'Replaces the POLI, DOKTER, KESADARAN, TINDAKAN, SPESIALIS and SARANA catalogs wholesale from PCare and reports the item count per catalog. DIAGNOSA and DPHO are keyword lookups upstream and are populated by the per-catalog search endpoint instead.',
    responseExample: {
      data: BPJS_PCARE_EXAMPLES.referenceSyncResult,
      message: 'BPJS reference catalogs synced',
    },
    notFoundDescription: 'BPJS PCare is not configured.',
  })
  async syncCatalogs(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.referenceService.syncCatalogs(actor);

    return {
      data: result,
      message: 'BPJS reference catalogs synced',
    };
  }

  @Get('status')
  @Auth([{ action: 'read', subject: 'BpjsReference' }])
  @ApiEndpoint({
    summary: 'Read per-catalog BPJS reference sync status',
    responseDescription:
      'Item count and last sync time for each of the eight catalogs. isSyncable is false for the keyword-cached DIAGNOSA and DPHO catalogs, which the bulk sync does not cover.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.referenceStatus },
  })
  async getStatus(@AuthUser() currentUser?: CurrentUser) {
    this.assertAuthenticated(currentUser);
    const statuses = await this.referenceService.getStatus();

    return { data: statuses };
  }

  @Get(':catalog')
  @Auth([{ action: 'read', subject: 'BpjsReference' }])
  @ApiEndpoint({
    summary: 'Search a synced BPJS reference catalog locally',
    responseDescription:
      'Entries from the local synced catalog matching the search term (code prefix or display substring). Never makes a live BPJS call — an empty result on DIAGNOSA/DPHO means the term has not been search-cached yet.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.referenceItems },
  })
  async searchCatalog(
    @Param() params: BpjsReferenceCatalogParamsDto,
    @Query() query: SearchBpjsReferenceQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    this.assertAuthenticated(currentUser);
    const items = await this.referenceService.searchLocal(this.toCatalogValue(params), query);

    return { data: items };
  }

  @Post(':catalog/search')
  @HttpCode(200)
  @Auth([{ action: 'sync', subject: 'BpjsReference' }])
  @ApiEndpoint({
    summary: 'Search a keyword-only BPJS catalog live and cache the results',
    responseDescription:
      'Runs the keyword lookup against PCare for the non-enumerable catalogs (DIAGNOSA, DPHO), upserts the results into the local catalog, and returns them. Rejected for catalogs the bulk sync covers.',
    responseExample: { data: BPJS_PCARE_EXAMPLES.remoteSearchResult },
    requestType: SearchBpjsReferenceRemoteDto,
    requestExample: BPJS_PCARE_EXAMPLES.remoteSearchRequest,
    notFoundDescription: 'BPJS PCare is not configured.',
  })
  async searchCatalogRemote(
    @Param() params: BpjsReferenceCatalogParamsDto,
    @Body() body: SearchBpjsReferenceRemoteDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const items = await this.referenceService.searchRemote(this.toCatalogValue(params), body, actor);

    return { data: items };
  }

  private toCatalogValue(params: BpjsReferenceCatalogParamsDto): BpjsReferenceCatalogValue {
    return params.catalog.toUpperCase() as BpjsReferenceCatalogValue;
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
