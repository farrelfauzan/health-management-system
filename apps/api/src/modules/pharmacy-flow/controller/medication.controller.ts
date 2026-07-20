import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@ApiTags('Pharmacy Flow')
@Controller({
  version: '1',
  path: 'medications',
})
export class MedicationController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Medication' }])
  @ApiEndpoint({
    summary: 'List medications',
    responseDescription: 'A searchable, paginated medication inventory list.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.pharmacy.medication],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listMedications(
    @Query() query: ListMedicationsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const result = await this.pharmacyFlowService.listMedications(query, currentUser);

    return {
      data: result.items,
      meta: result.meta,
    };
  }
}
