import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatToolRegistry } from './chat-tool.registry';
import { CheckMedicationExpiryTool } from './definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './definitions/check-medication-stock.tool';
import { GetAppointmentLoadTool } from './definitions/get-appointment-load.tool';
import { GetDailyCashierReportTool } from './definitions/get-daily-cashier-report.tool';
import { GetPatientSummaryTool } from './definitions/get-patient-summary.tool';
import { GetQueueBoardSummaryTool } from './definitions/get-queue-board-summary.tool';
import { ListMyAppointmentsTool } from './definitions/list-my-appointments.tool';
import { ListMyPatientsTool } from './definitions/list-my-patients.tool';

/**
 * Populates {@link ChatToolRegistry} at boot, behind `AI_CHAT_TOOLS_ENABLED`
 * (ai-chatbot-tools.md §7.4, default off — it gates the tool track as a
 * whole).
 *
 * The flag is enforced here rather than inside the dispatch loop on purpose.
 * With it off nothing is registered, so `hasRegisteredTools()` is false, the
 * per-message actor fetch is skipped, no `tools` field is serialized, and the
 * outbound request body is byte-identical to Phase 13 — the "every flag off
 * reproduces Phase 13 behaviour exactly" property is then structural rather
 * than a branch someone has to remember to write.
 */
@Injectable()
export class ChatToolRegistrarService implements OnModuleInit {
  constructor(
    private readonly chatToolRegistry: ChatToolRegistry,
    private readonly configService: ConfigService,
    private readonly checkMedicationStockTool: CheckMedicationStockTool,
    private readonly checkMedicationExpiryTool: CheckMedicationExpiryTool,
    private readonly listMyPatientsTool: ListMyPatientsTool,
    private readonly getPatientSummaryTool: GetPatientSummaryTool,
    private readonly listMyAppointmentsTool: ListMyAppointmentsTool,
    private readonly getQueueBoardSummaryTool: GetQueueBoardSummaryTool,
    private readonly getDailyCashierReportTool: GetDailyCashierReportTool,
    private readonly getAppointmentLoadTool: GetAppointmentLoadTool,
  ) {}

  onModuleInit(): void {
    if (!this.areToolsEnabled()) {
      return;
    }
    this.chatToolRegistry.registerTool(this.checkMedicationStockTool);
    this.chatToolRegistry.registerTool(this.checkMedicationExpiryTool);
    // P15-T06. Registered behind the same flag as the pharmacy tools rather
    // than a second one: the loop these ride on was proven end to end at zero
    // UU PDP exposure first, which is what the pharmacy pair was for, and a
    // per-tool flag would multiply the "which combination is live" question
    // the readiness review has to answer.
    this.chatToolRegistry.registerTool(this.listMyPatientsTool);
    this.chatToolRegistry.registerTool(this.getPatientSummaryTool);
    this.chatToolRegistry.registerTool(this.listMyAppointmentsTool);
    // P15-T18. The admin channel's three own tools; the two pharmacy tools
    // above already declare `ADMIN` in their channel lists, so they are
    // registered once and offered to both audiences.
    this.chatToolRegistry.registerTool(this.getQueueBoardSummaryTool);
    this.chatToolRegistry.registerTool(this.getDailyCashierReportTool);
    this.chatToolRegistry.registerTool(this.getAppointmentLoadTool);
  }

  private areToolsEnabled(): boolean {
    return this.configService.get<string>('AI_CHAT_TOOLS_ENABLED')?.trim().toLowerCase() === 'true';
  }
}
