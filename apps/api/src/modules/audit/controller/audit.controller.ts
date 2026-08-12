import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuditAction } from '../../../generated/prisma/client';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { ListAuditEventsQueryDto } from '../dto/list-audit-events-query.dto';
import { AuditQueryService } from '../service/audit-query.service';

@ApiTags('Audit')
@Controller({
  version: '1',
  path: 'audit',
})
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'AuditLog' }])
  // Reading the audit log is itself audited. Whoever can answer "who looked at
  // this chart" is exactly the person whose own looking has to be on record —
  // otherwise the one account that can survey every patient in the clinic is
  // the one account that leaves no trace doing it. `patientIdQuery` means a
  // review of one patient's history is filed under that patient.
  @Audited({
    resource: 'audit',
    action: AuditAction.READ,
    idParam: null,
    patientIdQuery: 'patientId',
  })
  @ApiEndpoint({
    summary: 'Query the patient-data access history',
    responseDescription:
      'Audit events matching the filters, newest first. Requires the audit.read:any permission.',
    responseExample: {
      data: [PHASE_THREE_EXAMPLES.audit.event],
      meta: PHASE_THREE_EXAMPLES.paginationMeta,
    },
  })
  async listAuditEvents(@Query() query: ListAuditEventsQueryDto) {
    const result = await this.auditQueryService.listAuditEvents(query);

    return {
      data: result.data,
      meta: result.meta,
    };
  }
}
