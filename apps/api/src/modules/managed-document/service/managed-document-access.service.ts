import { Injectable, UnauthorizedException } from '@nestjs/common';

import { ManagedDocumentAccessContext } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { Actor } from '../../../common/authorization/actor.types';
import { AuthRepository } from '../../auth/repository/auth.repository';

type SourceGrant = { resource: string; action: string };

const INVOICE_READ: SourceGrant = { resource: 'Invoice', action: 'read' };
const TEMPLATE_READ: SourceGrant = { resource: 'DocumentTemplate', action: 'read' };
const CORPUS_READ: SourceGrant = { resource: 'Document', action: 'read' };
const PATIENT_DOCUMENT_READ: SourceGrant = { resource: 'PatientDocument', action: 'read' };

/**
 * Resolves what the registry may show a caller (`P16-T28`, FR-E5-04).
 *
 * The global guard has proven `managed-document.read:any`; that says the
 * caller may use the registry, not which rows are theirs. Every row that
 * governs something from another module answers to that module's own read
 * grant, re-read here from the caller's roles in ANY scope — the same
 * facts `PermissionsGuard` would check on the source's own route. The
 * result is a small context the repository folds into its predicates, so
 * the rule is evaluated by the database for list, count and detail alike.
 */
@Injectable()
export class ManagedDocumentAccessService {
  constructor(private readonly authRepository: AuthRepository) {}

  async resolveContext(currentUser: CurrentUser): Promise<ManagedDocumentAccessContext> {
    const actor = await this.authRepository.findUserById(currentUser.sub);
    if (!actor) {
      throw new UnauthorizedException('User not found');
    }
    return {
      userId: currentUser.sub,
      canReadInvoices: hasAnyGrant(actor, INVOICE_READ),
      canReadTemplates: hasAnyGrant(actor, TEMPLATE_READ),
      canReadClinicCorpus: hasAnyGrant(actor, CORPUS_READ),
      canReadPatientDocuments: hasAnyGrant(actor, PATIENT_DOCUMENT_READ),
    };
  }
}

function hasAnyGrant(actor: Actor, grant: SourceGrant): boolean {
  return actor.roles.some((userRole) =>
    userRole.role.permissions.some(
      ({ permission }) =>
        permission.scope === 'ANY' &&
        ((permission.resource === grant.resource && permission.action === grant.action) ||
          (permission.resource === 'all' && permission.action === 'manage')),
    ),
  );
}
