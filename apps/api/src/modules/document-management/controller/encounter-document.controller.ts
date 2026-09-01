import { Controller, Get, Param, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { Audited } from '../../../common/audit/audited.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PATIENT_DOCUMENT_EXAMPLES } from '../../../common/openapi/patient-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { PatientDocumentService } from '../service/patient-document.service';

/**
 * The encounter workspace's Documents panel (`P16-T08`, FR-E2-05): this
 * visit's documents first, then the patient's history, so the doctor is not
 * consulting from memory or a phone photo. Lives in this module rather than
 * EMR because the documents are the resource — the encounter only names the
 * patient whose file is being read.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'encounters/:encounterId/documents',
})
export class EncounterDocumentController {
  constructor(private readonly patientDocumentService: PatientDocumentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @Audited({ resource: 'patient-document', action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List the documents for an encounter’s patient, grouped by visit',
    responseDescription:
      'Two groups: thisVisit holds documents linked to this encounter, history the rest of the patient’s file, both newest-first. Readable under the same OWN definition as the encounter itself — assigned or attending — and audited as a read of the patient’s record.',
    responseExample: {
      data: { thisVisit: [PATIENT_DOCUMENT_EXAMPLES.document], history: [] },
    },
    notFoundDescription: 'Encounter not found.',
  })
  async listEncounterDocuments(
    @Param('encounterId', new ParseUUIDPipe()) encounterId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.listEncounterDocuments(encounterId, actor);

    return { data: view };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
