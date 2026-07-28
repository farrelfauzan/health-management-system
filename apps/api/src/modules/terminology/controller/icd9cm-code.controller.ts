import { Icd9cmCode } from '@hms/shared-types';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { SearchIcd9cmCodesQueryDto } from '../dto/search-icd9cm-codes-query.dto';
import { Icd9cmCodeService } from '../service/icd9cm-code.service';

@ApiTags('Terminology')
@Controller({
  version: '1',
  path: 'icd9cm-codes',
})
export class Icd9cmCodeController {
  constructor(private readonly icd9cmCodeService: Icd9cmCodeService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Icd9cmCode' }])
  @ApiEndpoint({
    summary: 'Search ICD-9-CM procedure codes',
    responseDescription:
      'Matching ICD-9-CM procedure codes ordered by code. Matches against the code prefix and both the English and Indonesian titles.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.terminology.icd9cmCode] },
  })
  async searchIcd9cmCodes(
    @Query() query: SearchIcd9cmCodesQueryDto,
  ): Promise<{ data: Icd9cmCode[] }> {
    const codes = await this.icd9cmCodeService.searchIcd9cmCodes(query);

    return {
      data: codes,
    };
  }
}
