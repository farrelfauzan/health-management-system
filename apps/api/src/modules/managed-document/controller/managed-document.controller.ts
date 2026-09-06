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
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { BinaryResponseWriter } from '../../../common/http/binary-response.types';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MANAGED_DOCUMENT_EXAMPLES } from '../../../common/openapi/managed-document-examples';
import { AuditAction } from '../../../generated/prisma/client';
import { CreateManagedDocumentDto } from '../dto/create-managed-document.dto';
import { SubmitDocumentForApprovalDto } from '../dto/submit-document-for-approval.dto';
import { DocumentApprovalService } from '../service/document-approval.service';
import { CreateManagedDocumentUploadUrlDto } from '../dto/create-managed-document-upload-url.dto';
import { ExportManagedDocumentsQueryDto } from '../dto/export-managed-documents-query.dto';
import { ListManagedDocumentsQueryDto } from '../dto/list-managed-documents-query.dto';
import { UpdateManagedDocumentDto } from '../dto/update-managed-document.dto';
import { ManagedDocumentService } from '../service/managed-document.service';

const CREATED_STATUS = 201;

const OK_STATUS = 200;

const MANAGED_DOCUMENT_AUDIT_RESOURCE = 'managed-document';

/**
 * The documents registry (`P16-T28`, §7.5.8): list, search, draft, edit,
 * read, history and export, plus the lifecycle verbs `P16-T29` adds — submit,
 * withdraw and issue. Deciding lives on its own controller under its own
 * permission (`DocumentApprovalController`), because authoring a document and
 * signing it off are the two acts the module exists to keep apart (§7.5.9).
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
  constructor(
    private readonly managedDocumentService: ManagedDocumentService,
    private readonly documentApprovalService: DocumentApprovalService,
  ) {}

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

  @Post('upload-url')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Sign a browser-direct upload of a document’s body',
    responseDescription:
      'A short-lived PUT URL for exactly one file of the declared type and size, under a key this surface minted. Nothing is persisted: pass the returned storageKey to POST /documents (or PATCH) to record it, at which point the bytes are checked against the declared type (SJ-21) and images are re-encoded. Send `requiredHeaders` verbatim on the PUT.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.uploadUrl },
    requestType: CreateManagedDocumentUploadUrlDto,
    requestExample: MANAGED_DOCUMENT_EXAMPLES.uploadUrlRequest,
  })
  async createUploadUrl(@Body() payload: CreateManagedDocumentUploadUrlDto) {
    return { data: await this.managedDocumentService.createUploadUrl(payload) };
  }

  @Post()
  @HttpCode(CREATED_STATUS)
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Draft a document in the registry',
    responseDescription:
      'A new DRAFT of the named type. The type row decides the shape (FR-E5-35): a patient or doctor it requires must be named and one it does not require may not be, and the body must match its content mode — 422 `MANAGED_DOCUMENT_TYPE_RULE` lists each broken rule in `error.details.issues`. Drafted HTML is sanitised server-side before it is stored; an uploaded body is recorded from the stored object behind the storage key, which must be one this surface minted and whose bytes must agree with the declared type (SJ-21). A payload naming both `contentHtml` and `storageKey` is refused (400). `status`, `issuedAt` and the subject links are the server’s and are rejected if sent. A deactivated type answers 404 — it has left the picker (FR-E5-36).',
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

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Mint a signed download URL for an uploaded document body',
    responseDescription:
      'A signed URL valid for minutes, served as an attachment under the validated stored content type — nothing renders in the app or API origin (NFR-SEC-04). The download is audited before the URL is returned; if the access cannot be recorded, no URL is issued. A document drafted in the editor has no file: 409 `MANAGED_DOCUMENT_NOT_DOWNLOADABLE`.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'Document not found.',
  })
  async getDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.managedDocumentService.getDownloadUrl(id, actor) };
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

  // Route-level rather than class-level (`P16-T31`): the registry itself is
  // never switched off, and a clinic without the approval entitlement must not
  // be able to park a document in PENDING_APPROVAL that nobody can decide.
  @Post(':id/submit')
  @HttpCode(OK_STATUS)
  @RequireFeature('document-approval')
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Submit a draft for approval',
    responseDescription:
      'The document, now PENDING_APPROVAL, with its open round summarised in `approval`. The drafter names who approves *this* document and when it is due (FR-E5-09/10) — any live staff account, never a patient (422 `DOCUMENT_APPROVER_INELIGIBLE`). Submission freezes the content and the panel: an approver approves a specific artefact reviewed by a specific panel, and editing either afterwards voids the round (FR-E5-15). A panel naming only the drafter is refused here, while it can still be fixed, unless the type allows self-approval (422 `DOCUMENT_SELF_APPROVAL_FORBIDDEN`). `dueAt` buys reminders and an overdue flag and nothing else — no deadline ever decides (FR-E5-28). Only a draft may be submitted, and only one round may be open at a time (409 `DOCUMENT_NOT_SUBMITTABLE`).',
    responseExample: {
      data: MANAGED_DOCUMENT_EXAMPLES.pendingDetailView,
      message: 'Document submitted for approval',
    },
    requestType: SubmitDocumentForApprovalDto,
    requestExample: MANAGED_DOCUMENT_EXAMPLES.submitRequest,
    notFoundDescription: 'Document not found.',
  })
  async submitDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: SubmitDocumentForApprovalDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentApprovalService.submitForApproval(id, payload, actor);
    return { data, message: 'Document submitted for approval' };
  }

  @Post(':id/withdraw')
  @HttpCode(OK_STATUS)
  @RequireFeature('document-approval')
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Withdraw an open approval request',
    responseDescription:
      'The document, back in DRAFT, with its round marked WITHDRAWN (FR-E5-18). Nothing is decided — a withdrawal is the drafter changing their mind about asking, which is why it is a different outcome from a rejection and from the SUPERSEDED an edit produces. A document with no open round answers 409 `DOCUMENT_NOT_SUBMITTABLE`.',
    responseExample: {
      data: MANAGED_DOCUMENT_EXAMPLES.detailView,
      message: 'Approval request withdrawn',
    },
    notFoundDescription: 'Document not found.',
  })
  async withdrawDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentApprovalService.withdraw(id, actor);
    return { data, message: 'Approval request withdrawn' };
  }

  @Post(':id/issue')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'write', subject: 'ManagedDocument' }])
  @ApiEndpoint({
    summary: 'Issue a draft directly',
    responseDescription:
      'The document, ISSUED and dated (FR-E5-12). Available only for a type whose approval policy is off: when the type requires approval, ISSUED is reachable **only** through an approved round and this route answers 409 `DOCUMENT_APPROVAL_REQUIRED` regardless of what the client offered (FR-E5-11, NFR-SEC-09). A type whose issue step does something beyond releasing the row — publishing a template version, releasing a corpus file — is refused with 409 `DOCUMENT_ISSUE_BEHAVIOR_UNSUPPORTED` until P16-T32/T33 wire that behaviour, rather than being marked issued while the side effect never happened.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.detailView, message: 'Document issued' },
    notFoundDescription: 'Document not found.',
  })
  async issueDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentApprovalService.issue(id, actor);
    return { data, message: 'Document issued' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
