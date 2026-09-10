import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ListDistrictsQueryDto } from '../dto/list-districts-query.dto';
import { ListRegenciesQueryDto } from '../dto/list-regencies-query.dto';
import { ListVillagesQueryDto } from '../dto/list-villages-query.dto';
import { RegionsService } from '../service/regions.service';

/**
 * Master data changes by ministerial decree, a few times a year, and a
 * clinic's form asks for the same province list on every registration. A
 * day is short enough that a re-seeded region shows up by the next morning
 * and long enough that a browser stops asking. `public` because nothing in
 * these lists is about a person.
 */
const REGIONS_CACHE_CONTROL = 'public, max-age=86400';

/**
 * Indonesian administrative regions (P19-T10), read-only. Guarded by
 * `patient.read` in either scope, following how the specialty catalog rides
 * on `doctor.read`: reference data is readable by whoever can read the
 * records it describes, and everyone who fills in or views a patient
 * address holds that grant already.
 */
@ApiTags('Regions')
@Controller({
  version: '1',
  path: 'regions',
})
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('provinces')
  @Header('Cache-Control', REGIONS_CACHE_CONTROL)
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'List provinces',
    responseDescription: 'Every active province, ordered by name.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.regions.province] },
  })
  async listProvinces() {
    return { data: await this.regionsService.listProvinces() };
  }

  @Get('regencies')
  @Header('Cache-Control', REGIONS_CACHE_CONTROL)
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'List regencies in a province',
    responseDescription: 'The active regencies and cities of one province, ordered by name.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.regions.regency] },
  })
  async listRegencies(@Query() query: ListRegenciesQueryDto) {
    return { data: await this.regionsService.listRegencies(query.provinceCode) };
  }

  @Get('districts')
  @Header('Cache-Control', REGIONS_CACHE_CONTROL)
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'List districts in a regency',
    responseDescription: 'The active districts of one regency, ordered by name.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.regions.district] },
  })
  async listDistricts(@Query() query: ListDistrictsQueryDto) {
    return { data: await this.regionsService.listDistricts(query.regencyCode) };
  }

  @Get('villages')
  @Header('Cache-Control', REGIONS_CACHE_CONTROL)
  @Auth([{ action: 'read', subject: 'Patient' }])
  @ApiEndpoint({
    summary: 'Search villages in a district',
    responseDescription:
      'A page of the active villages of one district, ordered by name, optionally narrowed to those whose name starts with `q`.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.regions.village],
      meta: PHASE_THREE_EXAMPLES.regions.villagesMeta,
    },
  })
  async listVillages(@Query() query: ListVillagesQueryDto) {
    const result = await this.regionsService.listVillages({
      districtCode: query.districtCode,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result.items,
      meta: { page: query.page, limit: query.limit, total: result.total },
    };
  }
}
