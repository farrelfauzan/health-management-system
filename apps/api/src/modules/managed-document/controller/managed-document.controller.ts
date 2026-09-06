import {
  Body,
  Controller,
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

import { Audited } from '../../../common/audit/audited.decorator';
import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MANAGED_DOCUMENT_EXAMPLES } from '../../../common/openapi/managed-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateManagedDocumentDto } from '../dto/create-managed-document.dto';
import { ExportManagedDocumentsQueryDto } from '../dto/export-managed-documents-query.dto';
import { ListManagedDocumentsQueryDto } from '../dto/list-managed-documents-query.dto';
import { UpdateManagedDocumentDto } from '../dto/update-managed-document.dto';
import { ManagedDocumentService } from '../service/managed-document.service';

const CREATED_STATUS = 201;

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/**
 * The documents registry (`P16-T28`, §7.5.8): list, search, draft, edit,
 * read, history and export. The lifecycle verbs (submit, withdraw, issue)
 * arrive with `P16-T29`; the party and content-mode rules with `P16-T36`.
 *
 * Reading the registry needs `managed-document.read:any`. That is the gate
 * on the *surface*; every row still answers to its own source's rule inside
 * the service (FR-E5-04), which is why the same list call returns different
 * sets to different callers.
 */
@ApiTags('Documents')
@Controller({
  version: '1',
  path: 'documents',
})
export class ManagedDocumentController {
  constructor(private readonly managedDocumentService: ManagedDocumentService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  @Audited({ resource: MANAGED_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.READ, idParam: null })
  @ApiEndpoint({
    summary: 'List and search the documents registry',
    responseDescription:
      'Every managed document the caller is entitled to see, newest first, filterable by type, status, drafter, approver and a date range on created or issued, and searchable over title, document number and party names (FR-E5-02/03). Rows governing another module’s document — a patient bill, a template, a corpus or vault document — appear only to a caller who could open them there; `meta.total` is counted after that rule, so it never reveals a row the caller cannot see (FR-E5-04).',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.list },
  })
  async listDocuments(
    @Query() query: ListManagedDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.managedDocumentService.listDocuments(query, actor) };
  }

  /**
   * Declared before `:id` so `export` is not parsed as a document id.
   */
  @Get('export')
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  // Plain Swagger decorators rather than `ApiEndpoint`: that helper infers a
  // JSON schema from an example, and this route returns a file.
  @ApiOperation({ summary: 'Export the filtered registry as CSV' })
  @ApiOkResponse({
    description:
      'The same filters as the list, as a CSV of metadata only — id, type, title, number, status, parties, drafter and dates. Never a document body and never a storage key (FR-E5-07). Audited as an explicit export with the row count and the filters (NFR-PRIV-01). Capped at 5000 rows.',
  })
  @ApiProduces('text/csv')
  async exportDocuments(
    @Query() query: ExportManagedDocumentsQueryDto,
    @Res() response: BinaryResponseWriter,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const exported = await this.managedDocumentService.exportDocuments(query, actor);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    response.end(exported.csv);
  }

  @Post()
  @HttpCode(CREATED_STATUS)
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Draft a document in the registry',
    responseDescription:
      'A new DRAFT of the named type. Drafted HTML is sanitised server-side before it is stored; an uploaded body is recorded from the stored object behind the storage key, which must be one this surface minted. A payload naming both `contentHtml` and `storageKey` is refused (400). `status`, `issuedAt` and the subject links are the server’s and are rejected if sent. A deactivated type answers 404 — it has left the picker (FR-E5-36).',
    responseExample: {
      data: MANAGED_DOCUMENT_EXAMPLES.detailView,
      message: 'Document drafted',
    },
    requestType: CreateManagedDocumentDto,
    requestExample: MANAGED_DOCUMENT_EXAMPLES.createRequest,
    successStatus: CREATED_STATUS,
    notFoundDescription: 'Document type, patient or doctor not found.',
  })
  async createDocument(
    @Body() payload: CreateManagedDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.managedDocumentService.createDocument(payload, actor);
    return { data, message: 'Document drafted' };
  }

  @Get(':id')
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  @Audited({ resource: MANAGED_DOCUMENT_AUDIT_RESOURCE, action: AuditAction.READ })
  @ApiEndpoint({
    summary: 'Read one document',
    responseDescription:
      'The document with its drafted body, parties, type and drafter (FR-E5-05). A row the caller is not entitled to see — somebody else’s vault document, a patient bill without `invoice.read` — reports as not found rather than forbidden, so the registry never confirms what it will not show.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.detailView },
    notFoundDescription: 'Document not found.',
  })
  async getDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.managedDocumentService.getDocument(id, actor) };
  }

  @Patch(':id')
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Edit a draft',
    responseDescription:
      'The updated document. Only a DRAFT can be edited (409 `MANAGED_DOCUMENT_NOT_EDITABLE` otherwise, and always for a generated patient bill). Drafted HTML is sanitised on every write; an edit that would leave the row both drafted and uploaded is refused with 422 `MANAGED_DOCUMENT_CONTENT_CONFLICT` — clear one before setting the other.',
    responseExample: {
      data: MANAGED_DOCUMENT_EXAMPLES.detailView,
      message: 'Document updated',
    },
    requestType: UpdateManagedDocumentDto,
    requestExample: MANAGED_DOCUMENT_EXAMPLES.updateRequest,
    notFoundDescription: 'Document not found.',
  })
  async updateDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateManagedDocumentDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.managedDocumentService.updateDocument(id, payload, actor);
    return { data, message: 'Document updated' };
  }

  @Get(':id/history')
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Read a document’s history',
    responseDescription:
      'The document’s timestamps and every audit event recorded against it, oldest first, each with the actor and its metadata (FR-E5-05). Approval decisions and their reasons join this timeline under P16-T29.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.history },
    notFoundDescription: 'Document not found.',
  })
  async getHistory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.managedDocumentService.getHistory(id, actor) };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
