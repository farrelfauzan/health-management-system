import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { ConfirmPatientDocumentUploadDto } from '../dto/confirm-patient-document-upload.dto';
import { CreatePatientDocumentUploadUrlDto } from '../dto/create-patient-document-upload-url.dto';
import { ListPatientDocumentsQueryDto } from '../dto/list-patient-documents-query.dto';
import { PatientDocumentService } from '../service/patient-document.service';

/**
 * One patient's clinical file (`P16-T08`): the upload flow and the
 * patient-scoped list. The patient is named by the route and only the route —
 * no body carries one — and every read lands in the audit log, because the
 * regulatory question for a clinical record is "who looked" (FR-E2-07).
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'patients/:patientId/documents',
})
export class PatientDocumentController {
  constructor(private readonly patientDocumentService: PatientDocumentService) {}

  @Post('upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'PatientDocument' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload of a clinical file for this patient',
    responseDescription:
      'A short-lived signed URL the client PUTs the file to directly. The declared content type and size are validated before signing and signed into the URL. Nothing is persisted yet — call POST /patients/:patientId/documents with the returned storageKey to record it. A doctor may sign uploads only for patients assigned to them.',
    responseExample: { data: PATIENT_DOCUMENT_EXAMPLES.uploadUrl },
    requestType: CreatePatientDocumentUploadUrlDto,
    requestExample: PATIENT_DOCUMENT_EXAMPLES.uploadUrlRequest,
    notFoundDescription: 'Patient not found.',
  })
  async createUploadUrl(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Body() body: CreatePatientDocumentUploadUrlDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.createUploadUrl(patientId, body, actor);

    return { data: view };
  }

  @Post()
  @Auth([{ action: 'write', subject: 'PatientDocument' }])
  @Audited({ resource: 'patient-document', action: AuditAction.CREATE, patientIdParam: 'patientId' })
  @ApiEndpoint({
    summary: 'Record a completed upload as a clinical file on this patient’s record',
    responseDescription:
      'Records the uploaded object against the patient, tagged with a category and optionally linked to the encounter or admission it arose from — the episode must belong to this patient. The object’s bytes must agree with the declared type (SJ-21): a file that fails the check is deleted from storage, audit-logged, and refused with 400; accepted images are re-encoded before storage, which strips EXIF/GPS (FR-E2-09). Clinical files never enter the retrieval corpus.',
    responseExample: {
      data: PATIENT_DOCUMENT_EXAMPLES.document,
      message: 'Document added to the patient record',
    },
    requestType: ConfirmPatientDocumentUploadDto,
    requestExample: PATIENT_DOCUMENT_EXAMPLES.confirmRequest,
    notFoundDescription: 'Patient not found.',
  })
  async confirmUpload(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Body() body: ConfirmPatientDocumentUploadDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.patientDocumentService.confirmUpload(patientId, body, actor);

    return { data: view, message: 'Document added to the patient record' };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'PatientDocument' }])
  @Audited({
    resource: 'patient-document',
    action: AuditAction.READ,
    idParam: null,
    patientIdParam: 'patientId',
  })
  @ApiEndpoint({
    summary: 'List this patient’s clinical files',
    responseDescription:
      'Newest-first by document date, filterable by category, episode, and date range (FR-E2-04). A doctor sees the list when the patient is assigned to them or they attended one of the patient’s encounters; the patient themselves sees only files a clinician has released, with staff notes withheld.',
    responseExample: {
      data: [PATIENT_DOCUMENT_EXAMPLES.document],
      meta: { nextCursor: null },
    },
    notFoundDescription: 'Patient not found.',
  })
  async listDocuments(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Query() query: ListPatientDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.patientDocumentService.listDocuments(patientId, query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
