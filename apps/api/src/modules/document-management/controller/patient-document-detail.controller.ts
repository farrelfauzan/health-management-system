import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { Audited } from '../../../common/audit/audited.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PATIENT_DOCUMENT_EXAMPLES } from '../../../common/openapi/patient-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { DeletePatientDocumentDto } from '../dto/delete-patient-document.dto';
import { DownloadPatientDocumentQueryDto } from '../dto/download-patient-document-query.dto';
import { ReleasePatientDocumentDto } from '../dto/release-patient-document.dto';
import { UpdatePatientDocumentDto } from '../dto/update-patient-document.dto';
import { PatientDocumentService } from '../service/patient-document.service';

/**
 * One clinical file by id (`P16-T08`). These routes carry no patient in the
 * path — the record itself names the patient every access decision is about,
 * and a caller outside the record's reach gets a 404 that reveals nothing
 * about whether the id exists (US-E2-02). Download, release, and delete audit
 * imperatively in the service, because their rows carry context (episode,
 * reason) the route interceptor cannot know.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'patient-documents',
})
export class PatientDocumentDetailController {
  constructor(private readonly patientDocumentService: PatientDocumentService) {}

  @Get(':id')
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @Audited({ resource: 'patient-document', action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read one clinical file’s metadata',
    responseDescription:
      'The document’s metadata. Readable by staff with ANY scope, by a doctor with an active assignment or an attended encounter for the patient, and by the patient themselves once released — an unreleased document reports to the patient as not found.',
    responseExample: { data: PATIENT_DOCUMENT_EXAMPLES.document },
    notFoundDescription: 'Document not found.',
  })
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.getDocument(id, actor);

    return { data: view };
  }

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @ApiEndpoint({
    summary: 'Mint a signed download URL for one clinical file',
    responseDescription:
      'A signed URL valid for minutes, served as an attachment under the validated stored content type — nothing renders in the app or API origin (FR-E2-08). The download is audited with actor, patient, and episode context before the URL is returned; if the access cannot be recorded, no URL is issued. Pass encounterId when the file is being opened from an encounter workspace: it records *where the read happened*, as distinct from the encounter the document belongs to, and is validated against the document’s patient and your access to that encounter rather than trusted.',
    responseExample: { data: PATIENT_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'Document not found.',
  })
  async getDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: DownloadPatientDocumentQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.getDownloadUrl(id, actor, query);

    return { data: view };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'PatientDocument' }])
  @Audited({ resource: 'patient-document', action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Edit one clinical file’s metadata',
    responseDescription:
      'The updated document. The stored file is immutable — a wrong scan is deleted with a reason and re-uploaded. Passing null unlinks a care episode, which is required before a linked encounter can be retired.',
    responseExample: {
      data: PATIENT_DOCUMENT_EXAMPLES.document,
      message: 'Document updated',
    },
    requestType: UpdatePatientDocumentDto,
    requestExample: PATIENT_DOCUMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Document not found.',
  })
  async updateDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePatientDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.updateDocument(id, body, actor);

    return { data: view, message: 'Document updated' };
  }

  @Post(':id/release')
  @HttpCode(200)
  @Auth([{ action: 'release', subject: 'PatientDocument' }])
  @ApiEndpoint({
    summary:
      'Release one clinical file to the patient portal, and optionally send it to the patient',
    responseDescription:
      'Marks the document visible to the patient (FR-E2-13); the release is audited with actor and timestamp. Idempotent — a repeat returns the already-released document without rewriting releasedAt. With `dispatch`, the same action queues a password-protected PDF to the patient over each named channel under every E4 rule — consent, verified number, password lock, audit (FR-E4-24) — and tells the attending doctor of the document’s encounter in the bell (FR-E4-25). A channel that cannot be used is listed in `refusedChannels` with its reason and never fails the release; a document that is not a PDF or an image, or a patient with no date of birth to lock it with, refuses every channel the same way. Delivery happens only here, never on upload (FR-E4-26). The caption names the clinic, the document type and the date — no values, no diagnosis (FR-E4-27). Restricted to the attending relationship: a doctor releases only for patients assigned to them.',
    responseExample: {
      data: PATIENT_DOCUMENT_EXAMPLES.releaseView,
      message: 'Document released to the patient',
    },
    requestType: ReleasePatientDocumentDto,
    requestExample: PATIENT_DOCUMENT_EXAMPLES.releaseRequest,
    notFoundDescription: 'Document not found.',
  })
  async releaseDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReleasePatientDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.releaseDocument(id, body, actor);

    return { data: view, message: 'Document released to the patient' };
  }

  @Get(':id/deliveries')
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @ApiEndpoint({
    summary: 'Read a clinical file’s delivery timeline',
    responseDescription:
      'Every send ever queued for this document, newest first, in the same shape as an invoice’s timeline (FR-E4-14), plus whether the document’s category dispatches on release by default (FR-E4-28) — what the release dialog pre-checks. Readable under the same rule as the document itself.',
    responseExample: { data: PATIENT_DOCUMENT_EXAMPLES.deliveryTimeline },
    notFoundDescription: 'Document not found.',
  })
  async listDeliveries(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.patientDocumentService.listDeliveries(id, actor) };
  }

  @Delete(':id')
  @Auth([{ action: 'delete', subject: 'PatientDocument' }])
  @ApiEndpoint({
    summary: 'Soft-delete one clinical file, with a required reason',
    responseDescription:
      'Retires the document from every list. The row keeps the reason, the stored object stays in the bucket — clinical files fall under the 25-year RME retention floor, so nothing here hard-deletes (FR-E2-11). The deletion is audited with the reason.',
    responseExample: {
      data: PATIENT_DOCUMENT_EXAMPLES.deletedDocument,
      message: 'Document deleted',
    },
    requestType: DeletePatientDocumentDto,
    requestExample: PATIENT_DOCUMENT_EXAMPLES.deleteRequest,
    notFoundDescription: 'Document not found.',
  })
  async deleteDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DeletePatientDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.deleteDocument(id, body, actor);

    return { data: view, message: 'Document deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
