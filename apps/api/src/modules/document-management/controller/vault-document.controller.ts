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
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Audited } from '../../../common/audit/audited.decorator';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VAULT_DOCUMENT_EXAMPLES } from '../../../common/openapi/vault-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { ConfirmVaultDocumentUploadDto } from '../dto/confirm-vault-document-upload.dto';
import { CreateVaultDocumentUploadUrlDto } from '../dto/create-vault-document-upload-url.dto';
import { ListVaultDocumentsQueryDto } from '../dto/list-vault-documents-query.dto';
import { UpdateVaultDocumentDto } from '../dto/update-vault-document.dto';
import { toVaultDocumentView } from '../service/to-vault-document-view';
import { VaultDocumentService } from '../service/vault-document.service';
import { writeVaultDocumentArchive } from '../service/write-vault-document-archive';

const VAULT_DOCUMENT_AUDIT_RESOURCE = 'vault-document';

/**
 * The caller's own document vault (`P16-T17`) — their STR, their ijazah,
 * their KTP.
 *
 * `me` is the only addressable vault. No route here takes an owner or a user
 * id in its path, body or query (FR-E3-02), and no `:any` permission exists
 * for this surface at any role including ADMIN (FR-E3-03) — so there is no
 * request an administrator could send that would read someone else's vault,
 * and no permission anyone could grant to make one possible.
 *
 * Separate from `PersonalDocumentController` at `me/documents`, which is the
 * personal *knowledge base*: that corpus is chunked and its passages are sent
 * to the AI provider. Nothing here ever is.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'me/vault-documents',
})
export class VaultDocumentController {
  constructor(private readonly vaultDocumentService: VaultDocumentService) {}

  @Post('upload-url')
  @HttpCode(200)
  @Auth([{ action: 'write', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload into your own vault',
    responseDescription:
      'A short-lived signed URL the client PUTs the file to directly. The declared content type and size are validated before signing and then signed into the URL, so changing either header is rejected by the storage provider. Nothing is persisted yet — call POST /me/vault-documents with the returned storageKey to record it. Vault documents are stored and served only: they are never chunked, never embedded, and never sent to any AI provider.',
    responseExample: { data: VAULT_DOCUMENT_EXAMPLES.uploadUrl },
    requestType: CreateVaultDocumentUploadUrlDto,
    requestExample: VAULT_DOCUMENT_EXAMPLES.uploadUrlRequest,
  })
  async createUploadUrl(
    @Body() body: CreateVaultDocumentUploadUrlDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.createUploadUrl(body, actor);

    return { data: view };
  }

  @Post()
  @Auth([{ action: 'write', subject: 'VaultDocument' }])
  @Audited({ resource: VAULT_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.CREATE })
  @ApiEndpoint({
    summary: 'Record a completed upload in your own vault',
    responseDescription:
      'Records the uploaded object as a document you own. Owner is derived from your identity, never from the body — the storage key must be one issued to you by the vault upload-url route, so a key minted for your knowledge base or for the clinic corpus is refused here. The object’s bytes must agree with the declared type (SJ-21), and images are re-encoded, which is what strips EXIF GPS from a photographed licence.',
    responseExample: {
      data: VAULT_DOCUMENT_EXAMPLES.document,
      message: 'Document added to your vault',
    },
    requestType: ConfirmVaultDocumentUploadDto,
    requestExample: VAULT_DOCUMENT_EXAMPLES.confirmRequest,
  })
  async confirmUpload(
    @Body() body: ConfirmVaultDocumentUploadDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.confirmUpload(body, actor);

    return { data: view, message: 'Document added to your vault' };
  }

  @Get()
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  @Audited({ resource: VAULT_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'List the documents in your own vault',
    responseDescription:
      'Your documents only. Ownership is a predicate of the query rather than a filter on the result, so another user’s document is never in the returned set — and there is no query parameter that could widen it.',
    responseExample: {
      data: [VAULT_DOCUMENT_EXAMPLES.document],
      meta: { nextCursor: null },
    },
  })
  async listDocuments(
    @Query() query: ListVaultDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.vaultDocumentService.listDocuments(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  /**
   * Declared before `:id` so `export` is not parsed as a document id. The
   * `ParseUUIDPipe` on that route would refuse it anyway, but relying on a
   * 400 to disambiguate a route is not a design.
   */
  @Get('export')
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  // Plain Swagger decorators rather than `ApiEndpoint`: that helper infers a
  // JSON response schema from a canonical example, and this route answers with
  // a zip. It is the one binary body in the API — every other download is a
  // signed URL — and it is streamed rather than staged in the bucket on
  // purpose, because staging would leave a second, aggregate copy of someone's
  // identity documents at rest waiting for a lifecycle rule to remove it.
  @ApiOperation({
    summary: 'Download your whole vault as a zip',
    description:
      'A zip of every document you own plus a metadata.json describing them (FR-E3-12). Leaving the clinic should not mean leaving your own paperwork behind, and files without their reference numbers and expiry dates would be a worse copy than the one being replaced. The export is audited with the document count.',
  })
  @ApiProduces('application/zip')
  @ApiOkResponse({
    description: 'A zip archive of your vault.',
    schema: { type: 'string', format: 'binary' },
  })
  async exportVault(@Res() response: BinaryResponseWriter, @AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    const documents = await this.vaultDocumentService.listAllForExport(actor);
    const views = documents.map((document) => toVaultDocumentView(document));
    await this.vaultDocumentService.recordExport(actor, documents.length);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="vault-export.zip"');
    await writeVaultDocumentArchive({
      documents,
      views,
      readObject: (storageKey) => this.vaultDocumentService.readStoredObject(storageKey),
      destination: response,
    });
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  @Audited({ resource: VAULT_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read one document from your own vault',
    responseDescription:
      'The document’s metadata. A document you do not own reports as not found rather than forbidden — distinguishing the two would confirm that the id exists, which is itself a disclosure about someone else’s vault.',
    responseExample: { data: VAULT_DOCUMENT_EXAMPLES.document },
    notFoundDescription: 'Document not found in your vault.',
  })
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.getDocument(id, actor);

    return { data: view };
  }

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Get a signed download URL for one of your vault documents',
    responseDescription:
      'A signed URL valid for minutes, served as an attachment under the validated stored content type — nothing renders in the app or API origin. The download is audited with your identity before the URL is returned; if the access cannot be recorded, no URL is issued.',
    responseExample: { data: VAULT_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'Document not found in your vault.',
  })
  async getDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.getDownloadUrl(id, actor);

    return { data: view };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'VaultDocument' }])
  @Audited({ resource: VAULT_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.UPDATE })
  @ApiEndpoint({
    summary: 'Edit one of your vault documents',
    responseDescription:
      'Renames or re-files the document. The stored file is immutable; only your own notes about it change — category, reference number, issue and expiry dates. Passing null clears a field, which is how a date entered by mistake is removed.',
    responseExample: {
      data: VAULT_DOCUMENT_EXAMPLES.document,
      message: 'Document updated',
    },
    requestType: UpdateVaultDocumentDto,
    requestExample: VAULT_DOCUMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Document not found in your vault.',
  })
  async updateDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateVaultDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.updateDocument(id, body, actor);

    return { data: view, message: 'Document updated' };
  }

  @Delete(':id')
  // `delete`, not `write`, since P16-T41: an offboarded person's reduced
  // ability grants read and delete on their own vault and nothing that files
  // or edits, so the two verbs have to be distinguishable at the guard.
  @Auth([{ action: 'delete', subject: 'VaultDocument' }])
  @Audited({ resource: VAULT_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.DELETE })
  @ApiEndpoint({
    summary: 'Delete one of your vault documents',
    responseDescription:
      'Hard-deletes the row, the stored object and every expiry notice about it (FR-E3-09). There is no soft delete and no retention floor here: the 25-year RME rule covers a patient’s medical record, and applying it to your own identity documents would mean refusing to forget them when you ask.',
    responseExample: {
      data: VAULT_DOCUMENT_EXAMPLES.deletedDocument,
      message: 'Document deleted',
    },
    notFoundDescription: 'Document not found in your vault.',
  })
  async deleteDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentService.deleteDocument(id, actor);

    return { data: view, message: 'Document deleted' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
