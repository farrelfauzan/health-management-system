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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_MANAGEMENT_EXAMPLES } from '../../../common/openapi/document-management-examples';
import { ConfirmClinicDocumentUploadDto } from '../dto/confirm-clinic-document-upload.dto';
import { CreateClinicDocumentUploadUrlDto } from '../dto/create-clinic-document-upload-url.dto';
import { ListClinicDocumentsQueryDto } from '../dto/list-clinic-documents-query.dto';
import { SubmitClinicDocumentsForApprovalDto } from '../dto/submit-clinic-documents-for-approval.dto';
import { UpdateClinicDocumentDto } from '../dto/update-clinic-document.dto';
import { DocumentService } from '../service/document.service';

@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'admin/documents',
})
export class DocumentAdminController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload of a clinic document',
    responseDescription:
      'A short-lived signed URL the client PUTs the file to directly, so large documents never proxy through the API. The declared content type and size are validated before signing and then signed into the URL — changing either header is rejected by the storage provider. Nothing is persisted yet: a URL nobody uses leaves no document behind. Send `requiredHeaders` verbatim, then call POST /admin/documents with the returned storageKey.',
    responseExample: { data: DOCUMENT_MANAGEMENT_EXAMPLES.uploadUrl },
    requestType: CreateClinicDocumentUploadUrlDto,
    requestExample: DOCUMENT_MANAGEMENT_EXAMPLES.uploadUrlRequest,
  })
  async createUploadUrl(
    @Body() body: CreateClinicDocumentUploadUrlDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.createUploadUrl(body, actor);

    return { data: view };
  }

  @Post()
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Record a completed upload as a clinic document',
    responseDescription:
      'The created document. Size and MIME type are read back from the stored object rather than taken from this request — a client’s claim about what it uploaded is not evidence of what is in the bucket — and the object’s bytes must agree with that type (SJ-21): a PDF must carry the PDF signature and not be encrypted, text must be genuine UTF-8 text. A file that fails the check is deleted from storage and the rejection is audit-logged. A knowledge-base purpose rests at ingestStatus PENDING until the ingestion pipeline runs; GENERAL rests at NOT_APPLICABLE and is never embedded. Returns 400 when the key was not issued here, the object is missing, or its content fails validation, and 409 when the same upload was already recorded.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.pendingDocument,
      message: 'Document created',
    },
    requestType: ConfirmClinicDocumentUploadDto,
    requestExample: DOCUMENT_MANAGEMENT_EXAMPLES.confirmRequest,
    successStatus: 201,
  })
  async confirmUpload(
    @Body() body: ConfirmClinicDocumentUploadDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.confirmUpload(body, actor);

    return { data: view, message: 'Document created' };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'List clinic documents',
    responseDescription:
      'The clinic corpus, newest first, cursor-paginated. Personal knowledge bases are never included: this route is pinned to the shared corpus. chunkCount is what says whether a document is actually searchable — READY with zero chunks is a document that extracted to nothing.',
    responseExample: {
      data: [
        DOCUMENT_MANAGEMENT_EXAMPLES.pendingDocument,
        DOCUMENT_MANAGEMENT_EXAMPLES.staffOnlyDocument,
      ],
      meta: { nextCursor: null },
    },
  })
  async listDocuments(
    @Query() query: ListClinicDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.documentService.listDocuments(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  /** Declared before `:id` so `approval-context` is not parsed as a document id. */
  @Get('approval-context')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Read the corpus approval policy and its default panel',
    responseDescription:
      'The `CLINIC_CORPUS_DOCUMENT` type’s approval policy and configured default approvers, which is what the submit dialog opens with. Read once for the screen rather than repeated onto every row of the list: all of it is a property of the type and not of any one document. A clinic with no corpus type configured gets the all-off answer rather than a 404.',
    responseExample: { data: DOCUMENT_MANAGEMENT_EXAMPLES.approvalContext },
  })
  async getApprovalContext(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);

    return { data: await this.documentService.getApprovalContext(actor) };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Read one clinic document',
    responseDescription:
      'The document’s metadata and ingestion state. The storage key is never returned — it is an internal handle, and downloads are signed per request instead.',
    responseExample: { data: DOCUMENT_MANAGEMENT_EXAMPLES.staffOnlyDocument },
    notFoundDescription: 'Document not found.',
  })
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.getDocument(id, actor);

    return { data: view };
  }

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Mint a signed download URL for a clinic document',
    responseDescription:
      'A short-lived signed URL, issued per request and never persisted — the bucket is private and the API does not stream file bytes through itself.',
    responseExample: { data: DOCUMENT_MANAGEMENT_EXAMPLES.download },
    notFoundDescription: 'Document not found.',
  })
  async getDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.getDownloadUrl(id, actor);

    return { data: view };
  }

  @Get(':id/preview')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Read a clinic document’s text, for previewing it in the app',
    responseDescription:
      'The document’s text, extracted server-side, stripped of every tag and capped at 20,000 characters, so an admin can read a corpus document without downloading it. `isTruncated` says the document continues past what came back, and the signed download stays the way to read all of it. Markdown and plain text only: a PDF is 409 `CLINIC_DOCUMENT_NOT_PREVIEWABLE` and keeps its download.',
    responseExample: { data: DOCUMENT_MANAGEMENT_EXAMPLES.preview },
    notFoundDescription: 'Document not found.',
  })
  async getPreview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.getPreview(id, actor);

    return { data: view };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Edit a clinic document’s metadata',
    responseDescription:
      'The updated document. The stored file is immutable — replacing content means uploading a new document. Changing visibility or language discards the document’s chunks and returns it to PENDING, because chunks carry copies of both: a staff-only SOP demoted from BOTH must stop answering patient questions immediately, not once someone remembers to re-ingest.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.staffOnlyDocument,
      message: 'Document updated',
    },
    requestType: UpdateClinicDocumentDto,
    requestExample: DOCUMENT_MANAGEMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Document not found.',
  })
  async updateDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateClinicDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.updateDocument(id, body, actor);

    return { data: view, message: 'Document updated' };
  }

  @Post(':id/ingest')
  @HttpCode(202)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Queue a clinic document for re-ingestion',
    responseDescription:
      'Returns the document at ingestStatus PENDING. Extracting and embedding a long PDF is tens of seconds of work, so this queues rather than ingests inline — the background worker picks it up, and the existing chunks keep answering until the new set replaces them in one transaction. Requires DOCUMENT_INGESTION_ENABLED on the API, or the document waits indefinitely. Returns 400 for a GENERAL document, which is stored and served but never embedded.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.pendingDocument,
      message: 'Document queued for ingestion',
    },
    successStatus: 202,
    notFoundDescription: 'Document not found.',
  })
  async reingestDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.reingestDocument(id, actor);

    return { data: view, message: 'Document queued for ingestion' };
  }

  /**
   * Declared before `:id/...` for readability rather than necessity — it has
   * one path segment where those have two, so no route shadows another.
   */
  @Post('submit-for-approval')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Submit clinic corpus documents for approval',
    responseDescription:
      'Registers each document with the registry if it has no row yet, then opens one approval round per document against the panel named here (FR-E5-09/10). This is the whole action from the corpus screen: an upload under an active policy already parks its document at DRAFT, so "register" alone left the admin with a governed document, no round, and no way to make one. One panel covers the whole selection, because a clinic onboarding twenty-eight SOPs is asking one group to read them, not twenty-eight different groups. Not a transaction: every document reports its own outcome, so one already-issued row costs the rest nothing. Per-item refusals are the ones the single-document path raises — `DOCUMENT_NOT_SUBMITTABLE` for anything not at DRAFT, `DOCUMENT_APPROVER_INELIGIBLE` for a name that cannot approve, `DOCUMENT_SELF_APPROVAL_FORBIDDEN` for a panel of only the submitter.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.bulkSubmission,
      message: 'Documents submitted for approval',
    },
    requestType: SubmitClinicDocumentsForApprovalDto,
    requestExample: DOCUMENT_MANAGEMENT_EXAMPLES.submitForApprovalRequest,
  })
  async submitDocumentsForApproval(
    @Body() body: SubmitClinicDocumentsForApprovalDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.submitForApproval(body, actor);

    return { data: view, message: 'Documents submitted for approval' };
  }

  @Post(':id/send-for-review')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Put an existing corpus document behind the approval gate',
    responseDescription:
      'Registers the document with the documents registry so it can be submitted for approval (FR-E5-19, R-19). Turning the approval policy on is deliberately **not** retroactive — a document ingested before the switch keeps answering questions (OQ-18) — and this is the explicit action that changes that for one document. From this call until somebody approves it, the assistant cannot retrieve it. Returns 400 for a purpose that is never retrieved, where there would be nothing to review.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.pendingApprovalDocument,
      message: 'Document sent for review',
    },
    notFoundDescription: 'Document not found.',
  })
  async sendDocumentForReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.sendForReview(id, actor);

    return { data: view, message: 'Document sent for review' };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Retire a clinic document',
    responseDescription:
      'Soft-deletes the document and hard-deletes its chunks in the same write. Retrieval queries chunks directly, so a soft delete alone would retire the row while leaving the document answering questions; chunksRemoved is the evidence it stopped. The stored file survives the soft delete.',
    responseExample: {
      data: DOCUMENT_MANAGEMENT_EXAMPLES.deletedDocument,
      message: 'Document deleted',
    },
    notFoundDescription: 'Document not found.',
  })
  async deleteDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.documentService.deleteDocument(id, actor);

    return { data: view, message: 'Document deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
