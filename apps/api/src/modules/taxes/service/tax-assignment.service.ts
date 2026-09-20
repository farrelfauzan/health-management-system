import {
  BulkAssignTaxCodeInput,
  BulkAssignTaxCodeResult,
  ListTaxAssignmentsQuery,
  ResolvedTaxAssignmentTarget,
  TAX_ASSIGNMENT_TARGET_NOT_FOUND_ERROR_CODE,
  TaxAssignmentKindValue,
  TaxAssignmentRowView,
  TaxAssignmentsListMeta,
  TaxAssignmentTargetRecord,
  TaxCodeCatalog,
  resolveEffectiveTaxCode,
  toTaxDefaultTarget,
} from '@hms/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxAssignmentRepository } from '../../tax-core/repository/tax-assignment.repository';
import { TaxCodeService } from '../../tax-core/service/tax-code.service';

const TAX_ASSIGNMENT_AUDIT_RESOURCE = 'tax-assignment';
const ASSIGNMENT_KINDS: readonly TaxAssignmentKindValue[] = ['SERVICE_TARIFF', 'MEDICATION'];

/**
 * The tax code on every tariff and medication (P27-T03): "pengaturan pajak
 * untuk semua tarif". Each item is resolved override → category default →
 * unresolved, and the unresolved count covers everything, not the page, so
 * an administrator sees what is left before invoice issue (P27-T04) refuses it.
 */
@Injectable()
export class TaxAssignmentService {
  constructor(
    private readonly taxAssignmentRepository: TaxAssignmentRepository,
    private readonly taxCodeService: TaxCodeService,
    private readonly auditService: AuditService,
  ) {}

  async listAssignments(
    query: ListTaxAssignmentsQuery,
  ): Promise<{ items: TaxAssignmentRowView[]; meta: TaxAssignmentsListMeta }> {
    const [targets, catalog] = await Promise.all([
      this.taxAssignmentRepository.listActiveAssignmentTargets(),
      this.taxCodeService.getTaxCodeCatalog(),
    ]);
    const resolved = targets.map((target) => this.resolveTarget(target, catalog));
    const matching = resolved.filter((target) => this.matchesQuery(target, query));
    const start = (query.page - 1) * query.limit;
    return {
      items: matching
        .slice(start, start + query.limit)
        .map((target) => this.toRow(target, catalog)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: matching.length,
        unresolvedCount: resolved.filter((target) => target.effective.source === 'UNRESOLVED')
          .length,
      },
    };
  }

  /**
   * Applies one code to many items, or clears their override so they follow
   * the category default again. Every target must exist, so a stale selection
   * fails whole rather than half-applying.
   */
  async bulkAssign(
    input: BulkAssignTaxCodeInput,
    actor: CurrentUser,
  ): Promise<BulkAssignTaxCodeResult> {
    const taxCode = input.taxCodeId
      ? await this.taxCodeService.getActiveTaxCode(input.taxCodeId)
      : null;
    await this.assertTargetsExist(input);
    const updatedCount = await this.taxAssignmentRepository.assignTaxCode(input);
    await this.auditService.record({
      action: 'TAX_ASSIGNMENT_CHANGED',
      resource: TAX_ASSIGNMENT_AUDIT_RESOURCE,
      actorUserId: actor.sub,
      metadata: {
        taxCodeId: input.taxCodeId,
        code: taxCode?.code ?? null,
        targets: input.targets,
        updatedCount,
      },
    });
    return { updatedCount };
  }

  private async assertTargetsExist(input: BulkAssignTaxCodeInput): Promise<void> {
    const missing = await Promise.all(
      ASSIGNMENT_KINDS.map(async (kind) => {
        const requested = input.targets.filter((target) => target.kind === kind).map((t) => t.id);
        if (requested.length === 0) {
          return [];
        }
        const found = new Set(
          await this.taxAssignmentRepository.findExistingTargetIds(kind, requested),
        );
        return requested.filter((id) => !found.has(id)).map((id) => ({ kind, id }));
      }),
    );
    const missingTargets = missing.flat();
    if (missingTargets.length > 0) {
      throw new NotFoundException({
        code: TAX_ASSIGNMENT_TARGET_NOT_FOUND_ERROR_CODE,
        message: `${missingTargets.length} selected items no longer exist; reload the list`,
        errors: { targets: missingTargets },
      });
    }
  }

  private resolveTarget(
    target: TaxAssignmentTargetRecord,
    catalog: TaxCodeCatalog,
  ): ResolvedTaxAssignmentTarget {
    const defaultTarget = toTaxDefaultTarget(target.kind, target.category);
    const effective = resolveEffectiveTaxCode({
      overrideTaxCodeId: target.taxCodeId,
      defaultTaxCodeId: catalog.defaultCodeIdByTarget.get(defaultTarget) ?? null,
    });
    return { ...target, effective };
  }

  private matchesQuery(
    target: ResolvedTaxAssignmentTarget,
    query: ListTaxAssignmentsQuery,
  ): boolean {
    const search = query.search?.toLowerCase();
    return (
      (query.kind === undefined || target.kind === query.kind) &&
      (query.source === undefined || target.effective.source === query.source) &&
      (query.taxCodeId === undefined || target.effective.taxCodeId === query.taxCodeId) &&
      (search === undefined ||
        target.name.toLowerCase().includes(search) ||
        target.code.toLowerCase().includes(search))
    );
  }

  private toRow(
    target: ResolvedTaxAssignmentTarget,
    catalog: TaxCodeCatalog,
  ): TaxAssignmentRowView {
    const code = target.effective.taxCodeId
      ? catalog.codesById.get(target.effective.taxCodeId)
      : undefined;
    return {
      kind: target.kind,
      id: target.id,
      code: target.code,
      name: target.name,
      category: target.category ?? undefined,
      price: target.price ?? undefined,
      source: target.effective.source,
      effectiveTaxCode: code
        ? { id: code.id, code: code.code, name: code.name, ppnTreatment: code.ppnTreatment }
        : undefined,
    };
  }
}
