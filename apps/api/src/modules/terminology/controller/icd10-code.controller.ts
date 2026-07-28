import { Icd10Code } from '@hms/shared-types';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { SearchIcd10CodesQueryDto } from '../dto/search-icd10-codes-query.dto';
import { Icd10CodeService } from '../service/icd10-code.service';

@ApiTags('Terminology')
@Controller({
  version: '1',
  path: 'icd10-codes',
})
export class Icd10CodeController {
  constructor(private readonly icd10CodeService: Icd10CodeService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Icd10Code' }])
  @ApiEndpoint({
    summary: 'Search ICD-10 codes',
    responseDescription:
      'Matching ICD-10 codes ordered by code. Matches against the code prefix and both the English and Indonesian titles.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.terminology.icd10Code] },
  })
  async searchIcd10Codes(
    @Query() query: SearchIcd10CodesQueryDto,
  ): Promise<{ data: Icd10Code[] }> {
    const codes = await this.icd10CodeService.searchIcd10Codes(query);

    return {
      data: codes,
    };
  }
}
