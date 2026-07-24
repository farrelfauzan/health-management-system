import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ListSpecialtiesQueryDto } from '../dto/list-specialties-query.dto';
import { SpecialtyService } from '../service/specialty.service';

@ApiTags('Specialty')
@Controller({
  version: '1',
  path: 'specialties',
})
export class SpecialtyController {
  constructor(private readonly specialtyService: SpecialtyService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Doctor' }])
  @ApiEndpoint({
    summary: 'List specialties',
    responseDescription: 'The medical specialty catalog, ordered by name.',
    responseExample: { data: [PHASE_THREE_EXAMPLES.specialty.item] },
  })
  async listSpecialties(@Query() query: ListSpecialtiesQueryDto) {
    const specialties = await this.specialtyService.listSpecialties(query);

    return {
      data: specialties,
    };
  }
}
