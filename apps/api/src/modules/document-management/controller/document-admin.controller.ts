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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCUMENT_MANAGEMENT_EXAMPLES } from '../../../common/openapi/document-management-examples';
import { ConfirmClinicDocumentUploadDto } from '../dto/confirm-clinic-document-upload.dto';
import { CreateClinicDocumentUploadUrlDto } from '../dto/create-clinic-document-upload-url.dto';
import { ListClinicDocumentsQueryDto } from '../dto/list-clinic-documents-query.dto';
import { UpdateClinicDocumentDto } from '../dto/update-clinic-document.dto';
import { DocumentService } from '../service/document.service';

@ApiTags('Document Management')
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
      'The created document. Size and MIME type are read back from the stored object rather than taken from this request — a client’s claim about what it uploaded is not evidence of what is in the bucket. A knowledge-base purpose rests at ingestStatus PENDING until the ingestion pipeline runs; GENERAL rests at NOT_APPLICABLE and is never embedded. Returns 400 when the key was not issued here or the object is missing, and 409 when the same upload was already recorded.',
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
