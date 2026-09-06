import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { Audited } from '../../../common/audit/audited.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PATIENT_DOCUMENT_EXAMPLES } from '../../../common/openapi/patient-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ListPortalDocumentsQueryDto } from '../dto/list-portal-documents-query.dto';
import { PatientDocumentService } from '../service/patient-document.service';

/**
 * The patient's own document list (`P16-T08`). Only released files exist
 * here (FR-E2-13): a result reaches this list when a clinician decides it
 * does, so a patient never reads a frightening number with no one to ask.
 * The caller's patient record is resolved from their identity — no request
 * shape names another patient.
 */
@ApiTags('Document Management')
@RequireFeature('patient-documents')
@Controller({
  version: '1',
  path: 'portal/me/documents',
})
export class PortalDocumentController {
  constructor(private readonly patientDocumentService: PatientDocumentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @Audited({ resource: 'patient-document', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List your own released clinical documents',
    responseDescription:
      'The caller’s released documents, newest-first. Narrower fields than the staff view: staff working notes and internal user ids never reach the portal.',
    responseExample: {
      data: [PATIENT_DOCUMENT_EXAMPLES.portalDocument],
      meta: { nextCursor: null },
    },
  })
  async listPortalDocuments(
    @Query() query: ListPortalDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.patientDocumentService.listPortalDocuments(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
