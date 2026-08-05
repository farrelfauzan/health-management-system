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
import { PERSONAL_DOCUMENT_EXAMPLES } from '../../../common/openapi/personal-document-examples';
import { ConfirmPersonalDocumentUploadDto } from '../dto/confirm-personal-document-upload.dto';
import { CreatePersonalDocumentUploadUrlDto } from '../dto/create-personal-document-upload-url.dto';
import { ListPersonalDocumentsQueryDto } from '../dto/list-personal-documents-query.dto';
import { UpdatePersonalDocumentDto } from '../dto/update-personal-document.dto';
import { PersonalDocumentService } from '../service/personal-document.service';

/**
 * The caller's own knowledge base (`P15-T20`).
 *
 * Every route is scoped to the authenticated user by the service, and none of
 * them takes an owner in its path or body — `me` is the only addressable
 * corpus here, so there is no request shape that names someone else's.
 */
@ApiTags('Document Management')
@Controller({
  version: '1',
  path: 'me/documents',
})
export class PersonalDocumentController {
  constructor(private readonly personalDocumentService: PersonalDocumentService) {}

  @Post('upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload into your own knowledge base',
    responseDescription:
      'A short-lived signed URL the client PUTs the file to directly. The declared content type and size are validated before signing and then signed into the URL, so changing either header is rejected by the storage provider. Nothing is persisted yet — call POST /me/documents with the returned storageKey to record it. A personal knowledge base must contain no patient data: retrieved chunks are sent to the AI provider.',
    responseExample: { data: PERSONAL_DOCUMENT_EXAMPLES.uploadUrl },
    requestType: CreatePersonalDocumentUploadUrlDto,
    requestExample: PERSONAL_DOCUMENT_EXAMPLES.uploadUrlRequest,
  })
  async createUploadUrl(
    @Body() body: CreatePersonalDocumentUploadUrlDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.createUploadUrl(body, actor);

    return { data: view };
  }

  @Post()
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Record a completed upload in your own knowledge base',
    responseDescription:
      'Records the uploaded object as a document you own, queued for ingestion. Owner and purpose are derived from your identity, never from the body — the storage key must be one issued to you by the upload-url route, so a key minted for the clinic corpus is refused here.',
    responseExample: {
      data: PERSONAL_DOCUMENT_EXAMPLES.document,
      message: 'Document added to your knowledge base',
    },
    requestType: ConfirmPersonalDocumentUploadDto,
    requestExample: PERSONAL_DOCUMENT_EXAMPLES.confirmRequest,
  })
  async confirmUpload(
    @Body() body: ConfirmPersonalDocumentUploadDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.confirmUpload(body, actor);

    return { data: view, message: 'Document added to your knowledge base' };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'List the documents in your own knowledge base',
    responseDescription:
      'Your documents only. Ownership is a predicate of the query rather than a filter on the result, so another user’s document is never in the returned set.',
    responseExample: {
      data: [PERSONAL_DOCUMENT_EXAMPLES.document],
      meta: { nextCursor: null },
    },
  })
  async listDocuments(
    @Query() query: ListPersonalDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.personalDocumentService.listDocuments(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Read one document from your own knowledge base',
    responseDescription:
      'The document’s metadata and ingestion state. A document you do not own reports as not found rather than forbidden — distinguishing the two would confirm that the id exists.',
    responseExample: { data: PERSONAL_DOCUMENT_EXAMPLES.document },
    notFoundDescription: 'Document not found in your knowledge base.',
  })
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.getDocument(id, actor);

    return { data: view };
  }

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Mint a signed download URL for one of your documents',
    responseDescription:
      'A short-lived signed URL, issued per request and never persisted — the bucket is private and the API does not stream file bytes through itself.',
    responseExample: { data: PERSONAL_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'Document not found in your knowledge base.',
  })
  async getDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.getDownloadUrl(id, actor);

    return { data: view };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Edit one of your documents’ metadata',
    responseDescription:
      'The updated document. The stored file is immutable — replacing content means uploading a new document. Changing language discards the document’s chunks and returns it to PENDING, because chunks carry a copy of it.',
    responseExample: {
      data: PERSONAL_DOCUMENT_EXAMPLES.document,
      message: 'Document updated',
    },
    requestType: UpdatePersonalDocumentDto,
    requestExample: PERSONAL_DOCUMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Document not found in your knowledge base.',
  })
  async updateDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdatePersonalDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.updateDocument(id, body, actor);

    return { data: view, message: 'Document updated' };
  }

  @Post(':id/ingest')
  @HttpCode(202)
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Queue one of your documents for re-ingestion',
    responseDescription:
      'Returns the document at ingestStatus PENDING. Queued rather than ingested inline, because extracting and embedding a long PDF is tens of seconds of work. Requires DOCUMENT_INGESTION_ENABLED on the API, or the document waits indefinitely.',
    responseExample: {
      data: PERSONAL_DOCUMENT_EXAMPLES.pendingDocument,
      message: 'Document queued for ingestion',
    },
    successStatus: 202,
    notFoundDescription: 'Document not found in your knowledge base.',
  })
  async reingestDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.reingestDocument(id, actor);

    return { data: view, message: 'Document queued for ingestion' };
  }

  @Delete(':id')
  @Auth([{ action: 'write', subject: 'Document' }])
  @ApiEndpoint({
    summary: 'Remove a document from your own knowledge base',
    responseDescription:
      'Soft-deletes the document and hard-deletes its chunks in the same write. Retrieval queries chunks directly, so a soft delete alone would retire the row while leaving the document answering your questions; chunksRemoved is the evidence it stopped.',
    responseExample: {
      data: PERSONAL_DOCUMENT_EXAMPLES.deletedDocument,
      message: 'Document deleted',
    },
    notFoundDescription: 'Document not found in your knowledge base.',
  })
  async deleteDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.personalDocumentService.deleteDocument(id, actor);

    return { data: view, message: 'Document deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
