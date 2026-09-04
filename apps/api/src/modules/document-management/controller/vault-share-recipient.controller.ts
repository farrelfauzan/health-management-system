import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { Auth } from '../../../common/authorization/auth.decorator';
import { RequireFeature } from '../../../common/authorization/require-feature.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { VAULT_DOCUMENT_EXAMPLES } from '../../../common/openapi/vault-document-examples';
import { ListVaultDocumentShareRecipientsQueryDto } from '../dto/list-vault-document-share-recipients-query.dto';
import { VaultDocumentShareService } from '../service/vault-document-share.service';

/**
 * Who the caller could hand a vault document to (`P16-T34`).
 *
 * **Its own base path, and that is a bug fix rather than a preference.** This
 * lookup first shipped as `GET me/vault-documents/share-recipients`, on the
 * same controller as the share routes. Declaring it ahead of `:id/shares`
 * there was not enough: `VaultDocumentController` also mounts on
 * `me/vault-documents`, is registered earlier in the module, and carries a
 * `@Get(':id')` whose `ParseUUIDPipe` matched the literal segment first and
 * refused it as a malformed document id. Every search answered `400`, and the
 * picker rendered that as "nobody matching" — a wrong answer that looked like
 * a right one.
 *
 * Route order across sibling controllers is decided by the module's
 * `controllers` array, which is not where anyone looks when adding a route.
 * Moving the literal segment off the colliding prefix makes the collision
 * impossible rather than merely currently-avoided; the integration spec pins
 * a `200` so a future re-merge cannot quietly undo it.
 *
 * Not a user directory. It answers only over accounts that could actually
 * open a shared vault document, refuses below three characters, and returns
 * at most ten rows — a doctor holds no `user.read:any` grant, so some lookup
 * has to exist for sharing to be possible at all, and this is the narrowest
 * one that makes it possible.
 */
@ApiTags('Document Management')
@RequireFeature('document-management')
@Controller({
  version: '1',
  path: 'me/vault-share-recipients',
})
export class VaultShareRecipientController {
  constructor(private readonly vaultDocumentShareService: VaultDocumentShareService) {}

  @Get()
  @Auth([{ action: 'share', subject: 'VaultDocument' }])
  @ApiEndpoint({
    summary: 'Find people you could share a vault document with',
    responseDescription:
      'Live human accounts that could actually open a shared vault document — those holding `vault-document.read:own` — matched on their sign-in address. Deliberately not a user directory: a doctor holds no `user.read:any` grant, so some lookup has to exist for sharing to be possible at all, and this one refuses to answer below three characters and returns at most ten rows, so it cannot be walked to enumerate staff. Your own account is excluded.',
    responseExample: { data: [VAULT_DOCUMENT_EXAMPLES.shareRecipient] },
  })
  async listShareRecipients(
    @Query() query: ListVaultDocumentShareRecipientsQueryDto,
    @AuthUser() currentUser?: CurrentUser,
  ) {
    const actor = this.assertAuthenticated(currentUser);
    const result = await this.vaultDocumentShareService.listShareRecipients(query, actor);

    return { data: result.items };
  }

  private assertAuthenticated(currentUser?: CurrentUser): CurrentUser {
    if (!currentUser) {
      throw new UnauthorizedException('Authentication required');
    }
    return currentUser;
  }
}
