import { Controller, Get, Param, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { SATUSEHAT_EXAMPLES } from '../../../common/openapi/satusehat-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { SatusehatRecordComparisonService } from '../service/satusehat-record-comparison.service';

/**
 * The treating doctor's view of what SATUSEHAT holds for their visit (P21-T04).
 * Kept apart from {@link SatusehatSubmissionController} because the two answer
 * to different grants and show different things: that one is the admin
 * monitor and shows presence only; this one shows clinical content to the one
 * clinician allowed to see it.
 */
@ApiTags('SATUSEHAT')
@RequireFeature('satusehat')
@Controller({
  version: '1',
  path: 'satusehat',
})
export class SatusehatRecordController {
  constructor(private readonly recordComparisonService: SatusehatRecordComparisonService) {}

  @Get('encounters/:encounterId/record-comparison')
  @Auth([{ action: 'read', subject: 'SatusehatRecord' }])
  @Audited({ resource: 'satusehat-record', action: AuditAction.READ, idParam: 'encounterId' })
  @ApiEndpoint({
    summary: 'Compare this visit with what SATUSEHAT holds',
    responseDescription:
      "Lines up the visit's diagnoses, latest vital signs, procedures and medications against the resources SATUSEHAT holds for its submission, read back live by stored id. Each line is MATCHES, DIFFERS (both values shown), MISSING_ON_SATUSEHAT, or NOT_SENT with the reason the item was left out. Clinical content, so only the doctor who treated the patient may call it: other doctors, administrators and pharmacists get 403 (D-033). `unreadableResourceCount` counts reads that failed, so a missing verdict is never guessed. Audited as a read of the patient's record.",
    responseExample: { data: SATUSEHAT_EXAMPLES.recordComparison },
    notFoundDescription: 'Encounter not found, or the caller has no doctor profile.',
  })
  async compareEncounterRecord(
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      data: await this.recordComparisonService.compareEncounterRecord(encounterId, currentUser),
    };
  }
}
