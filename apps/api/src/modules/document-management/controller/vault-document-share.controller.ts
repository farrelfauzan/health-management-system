import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VAULT_DOCUMENT_EXAMPLES } from '../../../common/openapi/vault-document-examples';
import { CreateVaultDocumentShareDto } from '../dto/create-vault-document-share.dto';
import { VaultDocumentShareService } from '../service/vault-document-share.service';

/**
 * The owner's half of vault sharing (`P16-T34`, §7.3.5) — handing out keys to
 * documents in your **own** vault, and taking them back.
 *
 * Every route addresses a document by id and a person by id. None of them
 * takes an owner, so FR-E3-02 survives sharing intact: there is still no
 * request in this surface that names a *vault*. `vault-document.share:own` is
 * separate from `write:own` for the same reason `invoice.deliver:any` is
 * separate from `invoice.write:any` — handing a document to someone is a
 * different act from editing it, and a deployment can withhold the one key
 * and keep the vault.
 *
 * The audit trail for these acts is written by the service rather than the
 * route interceptor, because a grant and a revocation carry the owner, the
 * recipient and the authorising share, none of which a route decorator can
 * see.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'me/vault-documents',
})
export class VaultDocumentShareController {
  constructor(private readonly vaultDocumentShareService: VaultDocumentShareService) {}

  @Get(':id/shares')
  @Auth([{ action: 'share', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'List who one of your vault documents is shared with',
    responseDescription:
      'Every key to this document, live and revoked, each with the recipient, when they last opened it and how many times. Being able to watch the door is what makes people willing to open it, so the counts are product surface rather than an audit query the owner could not run. `isLive` is computed per request from the same three clauses the read path uses — not revoked, not expired, recipient still active — so it can never disagree with whether the document actually opens.',
    responseExample: { data: [VAULT_DOCUMENT_EXAMPLES.share] },
    notFoundDescription: 'Document not found in your vault.',
  })
  async listShares(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.vaultDocumentShareService.listSharesForDocument(id, actor);

    return { data: result.items };
  }

  @Post(':id/shares')
  @Auth([{ action: 'share', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Share one of your vault documents with one named person',
    responseDescription:
      'Grants view-and-download access to one person, optionally until a date. Owner-initiated and nothing else: there is no request-access flow anyone else could start. The recipient is notified; nothing else in your vault becomes visible to them, and they get no rename, delete or re-share capability. Re-sharing after a revoke revives the same row rather than adding history. Revoking later stops every future fetch — it cannot recall a copy already downloaded, which the UI states before the share is created.',
    responseExample: {
      data: VAULT_DOCUMENT_EXAMPLES.share,
      message: 'Document shared',
    },
    requestType: CreateVaultDocumentShareDto,
    requestExample: VAULT_DOCUMENT_EXAMPLES.shareRequest,
    notFoundDescription: 'Document not found in your vault, or no such recipient.',
  })
  async createShare(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateVaultDocumentShareDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentShareService.createShare(id, body, actor);

    return { data: view, message: 'Document shared' };
  }

  @Delete(':id/shares/:shareId')
  @Auth([{ action: 'share', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Revoke one share of one of your vault documents',
    responseDescription:
      'Takes the key back. Effective on that recipient’s next request with no window — the live-share test runs per request and nothing is cached — and the revocation is audited with the owner, the recipient and the share. It stops future fetches; it does not recall a copy already downloaded. Revoking twice is not an error and does not move the recorded time.',
    responseExample: {
      data: VAULT_DOCUMENT_EXAMPLES.revokedShare,
      message: 'Share revoked',
    },
    notFoundDescription: 'Document or share not found in your vault.',
  })
  async revokeShare(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('shareId', new ParseUUIDPipe()) shareId: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentShareService.revokeShare(id, shareId, actor);

    return { data: view, message: 'Share revoked' };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
