import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VAULT_DOCUMENT_EXAMPLES } from '../../../common/openapi/vault-document-examples';
import { ListSharedWithMeDocumentsQueryDto } from '../dto/list-shared-with-me-documents-query.dto';
import { VaultDocumentShareService } from '../service/vault-document-share.service';

/**
 * The recipient's half of vault sharing (`P16-T34`, FR-E3-17).
 *
 * Two routes, and the shape of the surface is the point: **read and download,
 * nothing else**. There is no PATCH, no DELETE and no re-share here — not
 * because those routes exist and check ownership, but because they live on
 * `VaultDocumentController`, which queries by owner, and a document shared
 * with you is not in the set it queries. A recipient's capability is bounded
 * by which controller can see the row, which is a stronger bound than a
 * refusal someone has to remember to write.
 *
 * These routes answer to `vault-document.read:own`, unchanged. `OWN` has
 * never meant strict ownership in this system — it means a relationship the
 * server can prove, and a live share the owner created is exactly such a
 * relationship. `vault-document.read:any` still does not exist, so nobody can
 * browse a vault; they can only open what they were handed.
 *
 * This is not a view onto anyone's vault. It contains the individual
 * documents handed to this person and shows nothing about what else those
 * vaults hold, or even how their owners file them — no category, no reference
 * number, no issue date. Those are the owner's private notes to themselves.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'shared-with-me/documents',
})
export class SharedWithMeDocumentController {
  constructor(private readonly vaultDocumentShareService: VaultDocumentShareService) {}

  @Get()
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'List documents shared with you',
    responseDescription:
      'The individual documents other people have handed you, newest key first. A share that has been revoked, has passed its expiry, or whose recipient account is no longer active drops out with no action from its owner — the test runs per request and nothing is cached. An empty list is a normal state, not an error.',
    responseExample: {
      data: [VAULT_DOCUMENT_EXAMPLES.sharedWithMeDocument],
      meta: { nextCursor: null },
    },
  })
  async listSharedWithMe(
    @Query() query: ListSharedWithMeDocumentsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.vaultDocumentShareService.listSharedWithMe(query, actor);

    return { data: result.items, meta: { nextCursor: result.nextCursor } };
  }

  @Get(':id/download')
  @Auth([{ action: 'read', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Get a signed download URL for a document shared with you',
    responseDescription:
      'A signed URL valid for minutes, served as an attachment. The access is recorded before the URL is returned — if it cannot be recorded, no URL is issued — and the owner is notified the first time you open it. A document whose share has been revoked or has expired reports as not found, the same as one that was never shared with you: distinguishing the two would confirm that a document exists in someone else’s vault.',
    responseExample: { data: VAULT_DOCUMENT_EXAMPLES.download },
    notFoundDescription: 'No live share of this document exists for you.',
  })
  async getSharedDownloadUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const view = await this.vaultDocumentShareService.getSharedDownloadUrl(id, actor);

    return { data: view };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
