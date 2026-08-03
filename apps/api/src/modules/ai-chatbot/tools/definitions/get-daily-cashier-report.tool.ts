import { Injectable } from '@nestjs/common';

import {
  CashierDailyReport,
  ChatChannelValue,
  ChatToolCashierDoctorLine,
  ChatToolCashierMethodLine,
  ChatToolNameValue,
  GetDailyCashierReportToolResult,
  getDailyCashierReportToolArgsSchema,
  getDailyCashierReportToolResultSchema,
} from '@hms/shared-types';

import { CurrentUser } from '../../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../../common/authorization/actor.types';
import { CashierReportService } from '../../../billing/service/cashier-report.service';
import { ChatTool } from '../chat-tool.interface';
import { projectToolResult } from '../project-tool-result';

/**
 * "What did we take today?" (P15-T18).
 *
 * **`CashierReportService.getDailyReport` takes no `CurrentUser`, and that is
 * a genuine exception to invariant 2 worth stating rather than hiding.** Every
 * other tool passes the asking user into a service that resolves scope from
 * them; this service resolves nothing, because a cash-drawer report has no
 * ownership dimension — there is one drawer and one clinic day. Its REST route
 * is gated entirely by `@Auth([{ action: 'read', subject: 'Invoice' }])`, so
 * the registry's `requiredPermission` below **is** that gate reproduced, and
 * the tool is still the same door as the route. The distinction matters only
 * if the service later grows a scope; a reviewer seeing `user` unused here
 * should check that it has not.
 *
 * `byDoctor` ships **included**, with the reasoning recorded in the result
 * schema: a revenue-by-doctor question is the point of the report, and the
 * practitioner names it carries are staff data rather than patient data.
 */
@Injectable()
export class GetDailyCashierReportTool implements ChatTool {
  readonly name: ChatToolNameValue = 'get_daily_cashier_report';

  readonly description: string = [
    'Settled payment totals for one clinic day, split by payment method and by doctor.',
    'Total pembayaran yang sudah lunas untuk satu hari, dipecah per metode pembayaran dan per dokter.',
    'Use for: "pendapatan hari ini berapa", "kas hari ini", "berapa yang bayar tunai", "revenue by doctor today", "apakah kas cocok".',
    'Do NOT use for: tagihan satu pasien tertentu, piutang atau invoice yang belum dibayar — hanya pembayaran yang sudah lunas yang dihitung; atau stok obat (pakai check_medication_stock).',
  ].join('\n');

  readonly channels: readonly ChatChannelValue[] = ['ADMIN'];

  readonly allowedRoleCodes: readonly string[] = ['ADMIN', 'SUPER_ADMIN'];

  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  } = { resource: 'Invoice', action: 'read', scope: 'ANY' };

  readonly argumentSchema = getDailyCashierReportToolArgsSchema;

  constructor(private readonly cashierReportService: CashierReportService) {}

  async execute(
    _user: CurrentUser,
    validatedArguments: unknown,
  ): Promise<GetDailyCashierReportToolResult> {
    const { date } = getDailyCashierReportToolArgsSchema.parse(validatedArguments);
    const report = await this.cashierReportService.getDailyReport(
      date === undefined ? {} : { date },
    );
    return projectToolResult(getDailyCashierReportToolResultSchema, {
      date: report.date,
      paymentCount: report.totals.count,
      totalAmount: report.totals.totalAmount,
      byMethod: report.byMethod.map((line) => this.toMethodLine(line)),
      byDoctor: report.byDoctor.map((line) => this.toDoctorLine(line)),
    });
  }

  private toMethodLine(line: CashierDailyReport['byMethod'][number]): ChatToolCashierMethodLine {
    return {
      method: line.method,
      count: line.count,
      totalAmount: line.totalAmount,
    };
  }

  /** `doctorId` is not copied: the name is what makes the line readable. */
  private toDoctorLine(line: CashierDailyReport['byDoctor'][number]): ChatToolCashierDoctorLine {
    return {
      doctorName: line.doctorName,
      count: line.count,
      totalAmount: line.totalAmount,
    };
  }
}
