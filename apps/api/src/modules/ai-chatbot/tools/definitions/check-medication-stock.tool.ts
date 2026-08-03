import { Injectable } from '@nestjs/common';

import {
  AI_CHAT_TOOL_LIST_PAGE_LIMIT,
  ChatChannelValue,
  ChatToolMedicationStockItem,
  ChatToolNameValue,
  CheckMedicationStockToolResult,
  MedicationResponse,
  checkMedicationStockToolArgsSchema,
  checkMedicationStockToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { PharmacyFlowService } from '../../../pharmacy-flow/service/pharmacy-flow.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

/**
 * "Do we have amoxicillin in stock?" — the first of the two pharmacy tools
 * (P15-T05), deliberately shipped before the patient tools because the answer
 * contains **no personal data at all**: it proves the whole Mode A loop (wire
 * catalogue, dispatch, validation, transcript, quota, rendering) at zero UU
 * PDP exposure.
 *
 * Backed by `PharmacyFlowService.listMedications` rather than
 * `getInventorySummary`: the medication list is what `medication.read:any`
 * actually opens (`GET /api/v1/medications`, and it already carries
 * `stockQty` / `reorderLevel` / `needsReorder`), while the inventory summary
 * is behind `inventory.read:any`, which a `DOCTOR` does not hold. Invariant 2
 * is not "the doctor may read some stock number somewhere" — it is that this
 * tool is the same door as the REST route, so it must be the route the
 * caller's own grant opens.
 */
@Injectable()
export class CheckMedicationStockTool implements ChatTool {
  readonly name: ChatToolNameValue = 'check_medication_stock';

  /**
   * Written as classifier input, not documentation (ai-chatbot-tools.md
   * §4.7.1): what it is for, what it is **not** for, and Indonesian trigger
   * phrasing, because users type Indonesian and tool descriptions are read in
   * English.
   */
  readonly description: string = [
    'Current stock level of clinic medications, optionally filtered by name.',
    'Berapa sisa stok obat di klinik saat ini, dan apakah perlu dipesan ulang.',
    'Use for: "ada stok amoxicillin?", "sisa berapa paracetamol", "obat apa saja yang perlu restock", "do we have ... in stock".',
    'Do NOT use for: tanggal kedaluwarsa atau batch obat (pakai check_medication_expiry), resep pasien tertentu, atau dosis.',
  ].join('\n');

  /**
   * Shared with the admin channel (P15-T18) rather than duplicated: stock
   * carries no personal data at all, so the same tool answers both audiences
   * and there is one projection to review instead of two that could drift.
   */
  readonly channels: readonly ChatChannelValue[] = ['DOCTOR', 'ADMIN'];

  readonly allowedRoleCodes: readonly string[] = ['DOCTOR', 'ADMIN', 'SUPER_ADMIN'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Medication', action: 'read', scope: 'ANY' };

  readonly argumentSchema = checkMedicationStockToolArgsSchema;

  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  /**
   * The registry has already validated these arguments against
   * {@link argumentSchema}; parsing again is how the shape is narrowed
   * without a cast, and it keeps the tool correct for any future caller.
   */
  async execute(
    user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<CheckMedicationStockToolResult> {
    const { medicationName } = checkMedicationStockToolArgsSchema.parse(validatedArguments);
    const page = await this.pharmacyFlowService.listMedications(
      {
        page: 1,
        // §7 minimisation: a list tool can never become a bulk export.
        limit: AI_CHAT_TOOL_LIST_PAGE_LIMIT,
        ...(medicationName === undefined ? {} : { search: medicationName }),
      },
      user,
    );
    return projectToolResult(checkMedicationStockToolResultSchema, {
      medicationName: medicationName ?? null,
      // The total, not the page length: a client must be able to say "20 of
      // 44" rather than imply the list it was handed is the whole answer.
      matchCount: page.meta.total,
      items: page.items.map((medication) => this.toStockItem(medication)),
    });
  }

  /**
   * The §4.3 allowlist, copied field by field. `id`, `kfaCode`, `dphoCode`,
   * `category`, and the row timestamps are not copied — a field nobody names
   * here cannot reach the result.
   */
  private toStockItem(medication: MedicationResponse): ChatToolMedicationStockItem {
    return {
      medicationCode: medication.code,
      medicationName: medication.name,
      ...(medication.form === undefined ? {} : { form: medication.form }),
      ...(medication.strength === undefined ? {} : { strength: medication.strength }),
      ...(medication.unit === undefined ? {} : { unit: medication.unit }),
      stockQty: medication.stockQty,
      reorderLevel: medication.reorderLevel,
      needsReorder: medication.needsReorder,
    };
  }
}
