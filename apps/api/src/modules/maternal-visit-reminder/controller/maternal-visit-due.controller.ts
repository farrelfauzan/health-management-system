import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VISIT_REMINDER_EXAMPLES } from '../../../common/openapi/visit-reminder-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ListMaternalVisitsDueQueryDto } from '../dto/list-maternal-visits-due-query.dto';
import { MaternalVisitWorklistService } from '../service/maternal-visit-worklist.service';

/**
 * The maternal due worklist (P25-T17). Authorised on the `Encounter` subject
 * like every maternal list: it is a view over the patients' visits.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1', path: 'maternal-visits' })
export class MaternalVisitDueController {
  constructor(private readonly worklistService: MaternalVisitWorklistService) {}

  @Get('due')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'maternal-visit-due', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List maternal visits due in a date range',
    responseDescription:
      "Trimester visits still owed (P25-T06) and KF/KN windows (P25-T12) that open or close in the range, KB courses due in it (P25-T14), and SHK samples not yet taken whose window touches it (P25-T10), soonest first. Both bounds are inclusive clinic-local dates; the default is today and the six days after. `patientId` is the person reminded — the mother for a baby's visit. `hasReminderConsent` and `reminder` say whether a WhatsApp reminder may go, and whether one did. Under OWN scope only the caller's own and assigned patients; 403 for a caller with no clinician profile. 400 for a range over 31 days.",
    responseExample: { data: VISIT_REMINDER_EXAMPLES.due },
  })
  async listDue(
    @Query() query: ListMaternalVisitsDueQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return { data: await this.worklistService.listDue(query, currentUser) };
  }
}
