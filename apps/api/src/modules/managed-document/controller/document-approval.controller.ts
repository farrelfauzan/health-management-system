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
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { MANAGED_DOCUMENT_EXAMPLES } from '../../../common/openapi/managed-document-examples';
import { ListDocumentApprovalsQueryDto } from '../dto/list-document-approvals-query.dto';
import { RejectDocumentApprovalDto } from '../dto/reject-document-approval.dto';
import { DocumentApprovalService } from '../service/document-approval.service';

const OK_STATUS = 200;

/**
 * Deciding on documents (`P16-T29`, §7.5.9).
 *
 * Its own controller under its own permission, `document-approval.decide:any`,
 * and that separation from `managed-document.write:any` is the control the
 * whole feature exists to provide: a records officer who drafts is not
 * thereby a person who signs off. Holding the key is still not sufficient —
 * every route here also requires being named on the round (FR-E5-13), which
 * the service checks and which no grant can substitute for.
 *
 * Gated on the `document-approval` entitlement rather than
 * `document-management` (`P16-T31`, US-E5-06): switching it off takes away
 * the second signature and leaves the registry, its search and its export
 * exactly as they were. A clinic small enough that one person writes and
 * issues everything is not served by a queue that always names them.
 */
@ApiTags('Documents')
@RequireFeature('document-approval')
@Controller({
  version: '1',
  path: 'document-approvals',
})
export class DocumentApprovalController {
  constructor(private readonly documentApprovalService: DocumentApprovalService) {}

  @Get()
  @Auth([{ action: 'decide', subject: 'DocumentApproval' }])
  @ApiEndpoint({
    summary: 'List approval requests',
    responseDescription:
      'The approval queue. `assignedToMe` defaults to true, so the queue is the caller’s own work list rather than everybody’s (US-E5-02); pass `assignedToMe=false` for the clinic-wide view. Rounds are ordered by deadline with undated ones last, so the most pressing sits at the top. `overdueOnly=true` narrows to rounds past `dueAt` — which are still PENDING and still actionable, because a deadline changes nothing about a round’s state (FR-E5-28).',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.approvalQueue },
  })
  async listApprovals(
    @Query() query: ListDocumentApprovalsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.documentApprovalService.listQueue(query, actor) };
  }

  /** Declared before `:id` so `pending-count` is not parsed as a request id. */
  @Get('pending-count')
  @Auth([{ action: 'decide', subject: 'DocumentApproval' }])
  @ApiEndpoint({
    summary: 'Count the approvals waiting on the caller',
    responseDescription:
      'What the sidebar badge renders (FR-E5-27): how many open rounds name the caller, and how many of those are past their deadline. `overdue` is a subset of `pending`, never a separate bucket to add.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.approvalPendingCount },
  })
  async getPendingCount(@AuthUser() currentUser?: CurrentUser) {
    const actor = this.assertAuthenticated(currentUser);
    return { data: await this.documentApprovalService.getPendingCount(actor) };
  }

  @Post(':id/approve')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'decide', subject: 'DocumentApproval' }])
  @ApiEndpoint({
    summary: 'Approve a document',
    responseDescription:
      'The document as it stands after the decision. When this approval is the one the round was waiting for, the **frozen version** is issued in the same transaction (FR-E5-16) — what the approver reviewed, not whatever the row says now. Approving needs both being named on the round (403 `DOCUMENT_APPROVAL_NOT_AN_APPROVER`) and holding `document-approval.decide:any`; neither is sufficient alone (FR-E5-13). A drafter cannot approve their own document unless the type allows it (403 `DOCUMENT_SELF_APPROVAL_FORBIDDEN`). Two approvers deciding at once produce one decision: the round is row-locked, and the loser gets 409 `DOCUMENT_APPROVAL_ALREADY_DECIDED`.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.detailView, message: 'Document approved' },
    notFoundDescription: 'Approval request not found.',
  })
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentApprovalService.approve(id, actor);
    return { data, message: 'Document approved' };
  }

  @Post(':id/reject')
  @HttpCode(OK_STATUS)
  @Auth([{ action: 'decide', subject: 'DocumentApproval' }])
  @ApiEndpoint({
    summary: 'Reject a document',
    responseDescription:
      'The document, returned to DRAFT with the round marked REJECTED (FR-E5-17). The reason is required — by this schema, by the service and by a CHECK on the table — and it stays in the document’s history forever, because a drafter who is told only "rejected" has been told nothing (US-E5-03). The same named-plus-permitted rule and the same row lock apply as on approve.',
    responseExample: { data: MANAGED_DOCUMENT_EXAMPLES.detailView, message: 'Document rejected' },
    requestType: RejectDocumentApprovalDto,
    requestExample: MANAGED_DOCUMENT_EXAMPLES.rejectRequest,
    notFoundDescription: 'Approval request not found.',
  })
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: RejectDocumentApprovalDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const data = await this.documentApprovalService.reject(id, payload, actor);
    return { data, message: 'Document rejected' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser?.sub) {
      throw new UnauthorizedException('Missing authenticated user');
    }
    return currentUser;
  }
}
