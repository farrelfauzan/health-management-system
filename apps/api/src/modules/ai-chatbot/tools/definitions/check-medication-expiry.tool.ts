import { Injectable } from '@nestjs/common';

import {
  AI_CHAT_TOOL_LIST_PAGE_LIMIT,
  ChatChannelValue,
  ChatToolMedicationExpiryItem,
  ChatToolNameValue,
  CheckMedicationExpiryToolResult,
  ExpiryReportItemResponse,
  checkMedicationExpiryToolArgsSchema,
  checkMedicationExpiryToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { PharmacyFlowService } from '../../../pharmacy-flow/service/pharmacy-flow.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

/**
 * "What expires in the next 30 days?" — the second pharmacy tool (P15-T05).
 * Batch expiry carries no personal data about a patient, and the receipt rows
 * it is built from carry two fields that must not travel (`receivedById`, a
 * staff user id, and free-text `notes`); the §4.3 allowlist names neither, so
 * neither survives.
 *
 * `requiredPermission` is `inventory.read:any`, which is what
 * `PharmacyFlowService.getExpiryReport` actually enforces — **not** the
 * `medication.read:any` of ai-chatbot-tools.md §2.1.1, which that table gets
 * wrong (amended in this PR). The difference is load-bearing rather than
 * pedantic: `DOCTOR` holds `medication.read:any` but not `inventory.read:any`
 * (`seed.sql`), so declaring the doc's permission would offer this tool to a
 * doctor whose lookup the domain service then refuses. Declaring the real one
 * means the tool is simply **not offered** in a doctor-channel session unless
 * the caller genuinely holds the grant — a doctor who also holds `PHARMACIST`
 * does, and the admin channel (P15-T17/T18) will. Fails closed, and no
 * permission is seeded to make a tool work (§4.1).
 */
@Injectable()
export class CheckMedicationExpiryTool implements ChatTool {
  readonly name: ChatToolNameValue = 'check_medication_expiry';

  /** Classifier input per §4.7.1 — see the sibling stock tool. */
  readonly description: string = [
    'Medication batches that are expired or expiring within a given number of days.',
    'Obat mana yang sudah atau akan kedaluwarsa dalam beberapa hari ke depan, per batch.',
    'Use for: "obat apa yang mau kadaluarsa", "ada obat expired?", "batch yang kedaluwarsa bulan ini", "what expires soon".',
    'Do NOT use for: jumlah stok yang tersedia (pakai check_medication_stock), penerimaan barang, atau resep pasien.',
  ].join('\n');

  /**
   * Shared with the admin channel (P15-T18). This is where the §2.1.1 note
   * about expiry "going live by ability rather than by edit" pays off: the
   * tool already declared `inventory.read:any`, `ADMIN` holds it, and the
   * channel list is the only line that changed.
   */
  readonly channels: readonly ChatChannelValue[] = ['DOCTOR', 'ADMIN'];

  readonly allowedRoleCodes: readonly string[] = ['DOCTOR', 'ADMIN', 'SUPER_ADMIN'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Inventory', action: 'read', scope: 'ANY' };

  readonly argumentSchema = checkMedicationExpiryToolArgsSchema;

  constructor(private readonly pharmacyFlowService: PharmacyFlowService) {}

  async execute(
    user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<CheckMedicationExpiryToolResult> {
    const { days } = checkMedicationExpiryToolArgsSchema.parse(validatedArguments);
    const report = await this.pharmacyFlowService.getExpiryReport({ days }, user);
    return projectToolResult(checkMedicationExpiryToolResultSchema, {
      asOfDate: report.asOfDate,
      throughDate: report.throughDate,
      // Counted over the whole report, before the page cap: "3 expired" must
      // stay true when only the first twenty batches are rendered.
      expiredCount: this.countStatus(report.items, 'EXPIRED'),
      expiringCount: this.countStatus(report.items, 'EXPIRING'),
      unknownExpiryCount: this.countStatus(report.items, 'UNKNOWN'),
      matchCount: report.items.length,
      // The service orders by expiry date ascending, so the capped page is
      // the soonest-expiring batches rather than an arbitrary twenty.
      items: report.items
        .slice(0, AI_CHAT_TOOL_LIST_PAGE_LIMIT)
        .map((item) => this.toExpiryItem(item)),
    });
  }

  private countStatus(
    items: readonly ExpiryReportItemResponse[],
    status: ExpiryReportItemResponse['expiryStatus'],
  ): number {
    return items.filter((item) => item.expiryStatus === status).length;
  }

  /**
   * The §4.3 allowlist, copied field by field. `receivedById`, `notes`, `id`,
   * `medicationId`, `receivedAt`, `quantity`, and `allocatedQty` are not
   * copied — a staff identifier or a free-text note cannot reach the result
   * even if a future edit to the receipt projection adds more of them.
   */
  private toExpiryItem(item: ExpiryReportItemResponse): ChatToolMedicationExpiryItem {
    return {
      medicationCode: item.medicationCode,
      medicationName: item.medicationName,
      batchNumber: item.batchNumber,
      ...(item.expiryDate === undefined ? {} : { expiryDate: item.expiryDate }),
      remainingQty: item.remainingQty,
      expiryStatus: item.expiryStatus,
      ...(item.daysUntilExpiry === undefined ? {} : { daysUntilExpiry: item.daysUntilExpiry }),
    };
  }
}
