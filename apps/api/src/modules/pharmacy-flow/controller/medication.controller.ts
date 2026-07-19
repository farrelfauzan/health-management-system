import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { PharmacyFlowService } from '../service/pharmacy-flow.service';

@Controller({
  version: '1',
  path: 'medications',
})
export class MedicationController {
  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'Medication' }])
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
