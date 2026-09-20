import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MATERNAL_CARE_EXAMPLES } from '../../../common/openapi/maternal-care-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { DismissAntenatalReferralDto } from '../dto/dismiss-antenatal-referral.dto';
import { IssueAntenatalReferralLetterDto } from '../dto/issue-antenatal-referral-letter.dto';
import { UpsertAntenatalExaminationDto } from '../dto/upsert-antenatal-examination.dto';
import { AntenatalExaminationService } from '../service/antenatal-examination.service';

/**
 * The integrated 10T examination of an antenatal visit and the two letters a
 * midwife issues from it (P25-T07). Authorised on the `Encounter` subject,
 * like the episode it belongs to.
 */
@ApiTags('Maternal Care')
@RequireFeature('maternal-care')
@Controller({ version: '1' })
export class AntenatalExaminationController {
  constructor(private readonly antenatalExaminationService: AntenatalExaminationService) {}

  @Get('encounters/:encounterId/antenatal-examination')
  @Auth([{ action: 'read', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-examination', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: "Read this visit's 10T examination",
    responseDescription:
      'The examination, the computed 10T checklist with each item\'s source, and the sourced referral prompts the findings set off. 409 ANTENATAL_VISIT_REQUIRED when the encounter is not counted as an antenatal visit.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.examination },
    notFoundDescription: 'Encounter not found.',
  })
  async getExamination(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.antenatalExaminationService.getExamination(
        encounterId,
        this.requireUser(currentUser),
      ),
    };
  }

  @Put('encounters/:encounterId/antenatal-examination')
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-examination', action: AuditAction.UPDATE, idParam: null })
  @ApiEndpoint({
    summary: "Record this visit's 10T examination",
    responseDescription:
      'Upsert — one examination per visit, so coming back to add the foetal heart rate edits the row rather than filing a second reading. Every field is optional: a checklist item that was not done is "not done", not invalid. Weight, height and blood pressure are not accepted here; they come from the vitals.',
    responseExample: {
      data: MATERNAL_CARE_EXAMPLES.examination,
      message: 'Antenatal examination saved',
    },
    requestType: UpsertAntenatalExaminationDto,
    notFoundDescription: 'Encounter not found.',
  })
  async upsertExamination(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: UpsertAntenatalExaminationDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.antenatalExaminationService.upsertExamination(
        encounterId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Antenatal examination saved',
    };
  }

  @Post('encounters/:encounterId/antenatal-referral-dismissals')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-examination', action: AuditAction.UPDATE, idParam: null })
  @ApiEndpoint({
    summary: 'Set a referral prompt aside',
    responseDescription:
      'Records that the midwife saw the prompt and judged otherwise, with her reason. Nothing is ever blocked by a prompt, so this row is the only evidence the finding was noticed — which is why the reason is required and the dismissal audited.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.examination },
    requestType: DismissAntenatalReferralDto,
    notFoundDescription: 'Encounter not found.',
  })
  async dismissReferralRule(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: DismissAntenatalReferralDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.antenatalExaminationService.dismissReferralRule(
        encounterId,
        payload,
        this.requireUser(currentUser),
      ),
    };
  }

  @Post('encounters/:encounterId/antenatal-referral-letter')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'antenatal-examination', action: AuditAction.CREATE, idParam: null })
  @ApiEndpoint({
    summary: 'Issue the surat rujukan',
    responseDescription:
      'Renders the letter from the episode and this visit and files it as a PATIENT_CLINICAL document. Each issue is a new document and the previous one is kept — a letter the patient already carried to a hospital is a record of what was said that day.',
    responseExample: { data: MATERNAL_CARE_EXAMPLES.document, message: 'Referral letter issued' },
    requestType: IssueAntenatalReferralLetterDto,
    notFoundDescription: 'Encounter not found.',
  })
  async issueReferralLetter(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @Body() payload: IssueAntenatalReferralLetterDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.antenatalExaminationService.issueReferralLetter(
        encounterId,
        payload,
        this.requireUser(currentUser),
      ),
      message: 'Referral letter issued',
    };
  }

  @Post('pregnancy-episodes/:id/pregnancy-certificate')
  @HttpCode(201)
  @Auth([{ action: 'write', subject: 'Encounter' }])
  @Audited({ resource: 'pregnancy-episode', action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Issue the surat keterangan hamil',
    responseDescription:
      'Rendered from the episode rather than from a visit, because what it attests is the pregnancy, and filed on the patient under the PREGNANCY_CERTIFICATE category.',
    responseExample: {
      data: { ...MATERNAL_CARE_EXAMPLES.document, kind: 'PREGNANCY_CERTIFICATE' },
      message: 'Pregnancy certificate issued',
    },
    notFoundDescription: 'Pregnancy episode not found.',
  })
  async issuePregnancyCertificate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    return {
      data: await this.antenatalExaminationService.issuePregnancyCertificate(
        id,
        this.requireUser(currentUser),
      ),
      message: 'Pregnancy certificate issued',
    };
  }

  private requireUser(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }

    return currentUser;
  }
}
