import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  BpjsAntreanInboundRejectionReason,
  BpjsAntreanInboundService,
} from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../generated/prisma/client';

const AUDIT_RESOURCE = 'BpjsAntreanInbound';
const MEMBER_HASH_LABEL = 'bpjs-antrean-inbound-member-v1';
const MEMBER_HASH_LENGTH = 16;

/**
 * The audit trail for the inbound Antrean surface (P14-T04). Every call is
 * recorded — accepted *and* refused — because these endpoints face the public
 * internet, where "no rows" has to mean "nobody called", not "we only log the
 * happy path".
 *
 * **Member identifiers are hashed, never stored.** A card number or NIK in an
 * audit row would put an unencrypted national identifier in a table that
 * exists to be read by admins, defeating the blind-index design the patient
 * module is built on. The hash is stable within a deployment, so an
 * investigator can still follow one member across a sequence of calls without
 * the log ever naming them.
 *
 * There is no actor: BPJS is not an HMS user. `actorUserId` is deliberately
 * null on these rows, and the reserved system account appears only on the
 * domain rows the call goes on to create.
 */
@Injectable()
export class BpjsAntreanInboundAuditService {
  constructor(private readonly auditService: AuditService) {}

  async recordAccepted(params: {
    action: AuditAction;
    service: BpjsAntreanInboundService;
    sourceIp: string | null;
    memberIdentifier?: string;
    resourceId?: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditService.record({
      action: params.action,
      resource: AUDIT_RESOURCE,
      resourceId: params.resourceId,
      actorUserId: null,
      metadata: {
        service: params.service,
        outcome: 'ACCEPTED',
        sourceIp: params.sourceIp,
        memberHash: this.hashMemberIdentifier(params.memberIdentifier),
        ...params.detail,
      },
    });
  }

  /**
   * Records a refusal with the *precise* reason, which is exactly what the
   * BPJS-facing response withholds. The two audiences are different: BPJS
   * gets "unauthorized", the clinic's auditor gets "the source IP was not on
   * the allowlist" — and only the second one is useful when a UAT call fails
   * and nobody can tell whether it arrived.
   */
  async recordRejected(params: {
    service: BpjsAntreanInboundService;
    reason: BpjsAntreanInboundRejectionReason;
    sourceIp: string | null;
    memberIdentifier?: string;
  }): Promise<void> {
    await this.auditService.record({
      action: AuditAction.BPJS_ANTREAN_INBOUND_CALL_REJECTED,
      resource: AUDIT_RESOURCE,
      actorUserId: null,
      metadata: {
        service: params.service,
        outcome: 'REJECTED',
        reason: params.reason,
        sourceIp: params.sourceIp,
        memberHash: this.hashMemberIdentifier(params.memberIdentifier),
      },
    });
  }

  private hashMemberIdentifier(memberIdentifier?: string): string | null {
    if (memberIdentifier === undefined || memberIdentifier === '') {
      return null;
    }
    return createHash('sha256')
      .update(`${MEMBER_HASH_LABEL}:${memberIdentifier}`)
      .digest('hex')
      .slice(0, MEMBER_HASH_LENGTH);
  }
}
