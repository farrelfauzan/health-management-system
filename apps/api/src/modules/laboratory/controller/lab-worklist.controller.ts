import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { LABORATORY_EXAMPLES } from '../../../common/openapi/laboratory-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { LabWorklistQueryDto } from '../dto/lab-worklist-query.dto';
import { LabSpecimenService } from '../service/lab-specimen.service';

/**
 * The bench's working list, bucketed by what the analis has to do next.
 *
 * Behind `lab-order.read:any` and no OWN branch: this is the whole clinic's
 * work for a day, and there is no version of it scoped to one person.
 */
@ApiTags('Laboratory Orders')
@RequireFeature('laboratory')
@Controller({ version: '1', path: 'lab-worklist' })
export class LabWorklistController {
  constructor(private readonly labSpecimenService: LabSpecimenService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'LabOrder' }])
  @Audited({ resource: 'lab-worklist', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List the laboratory worklist',
    responseDescription:
      'Cito first, then oldest first. Each row carries the patient identity needed to match a tube to a person and the order’s clinical notes — and nothing else clinical: a worklist is not a route into the medical record.',
    responseExample: { data: [LABORATORY_EXAMPLES.labWorklist.item] },
  })
  async listWorklist(@Query() query: LabWorklistQueryDto) {
    return { data: await this.labSpecimenService.listWorklist(query) };
  }
}
