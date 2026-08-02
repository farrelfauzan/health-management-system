import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatToolRegistry } from './chat-tool.registry';
import { CheckMedicationExpiryTool } from './definitions/check-medication-expiry.tool';
import { CheckMedicationStockTool } from './definitions/check-medication-stock.tool';

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
  ) {}

  onModuleInit(): void {
    if (!this.areToolsEnabled()) {
      return;
    }
    this.chatToolRegistry.registerTool(this.checkMedicationStockTool);
    this.chatToolRegistry.registerTool(this.checkMedicationExpiryTool);
  }

  private areToolsEnabled(): boolean {
    return this.configService.get<string>('AI_CHAT_TOOLS_ENABLED')?.trim().toLowerCase() === 'true';
  }
}
