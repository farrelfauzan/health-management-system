import { NestFactory } from '@nestjs/core';

import { buildChatToolWireDefinitions } from '../modules/ai-chatbot/tools/build-chat-tool-wire-definitions';
import { AppModule } from '../app.module';
import { AI_CHAT_SYSTEM_PROMPTS } from '../modules/ai-chatbot/service/ai-chat-system-prompts';
import { AiProviderResolverService } from '../modules/ai-chatbot/service/ai-provider-resolver.service';
import { ChatToolRegistry } from '../modules/ai-chatbot/tools/chat-tool.registry';
import { scoreToolSelection } from '../modules/ai-chatbot/eval/score-tool-selection';
import { TOOL_SELECTION_EVAL_SET } from '../modules/ai-chatbot/eval/tool-selection-eval-set';
import {
  ToolSelectionEvalObservation,
  ToolSelectionEvalReport,
} from '../modules/ai-chatbot/eval/tool-selection-eval.types';

/**
 * Runs the §4.7.3 tool-selection eval against the **currently active**
 * `AiProviderConfig` and prints the five metrics.
 *
 * Usage:
 *
 *   AI_CHAT_ENABLED=true AI_CHAT_TOOLS_ENABLED=true \
 *     pnpm --filter @hms/api exec ts-node src/scripts/run-tool-selection-eval.ts
 *
 * **This is deliberately a script and not a test.** It costs real tokens
 * against a real vendor, its result depends on which config is active, and it
 * is not deterministic — three properties that make it a bad CI job and a
 * necessary measurement. Run it once per `AiProviderKind` the clinic might
 * use and record the numbers in
 * `docs/post-mvp/ai-chatbot-tool-selection-eval.md`.
 *
 * Each case is sent as a **fresh single-turn exchange** with the doctor system
 * prompt and the full tool catalogue, and nothing else. No history, no context
 * enrichment, no retrieval: the question under measurement is "given this
 * catalogue and this message, does the model pick the right lookup", and every
 * additional input is a confound that makes two runs incomparable.
 *
 * The caller is synthesised with the grants `seed.sql` gives `DOCTOR` **plus**
 * `inventory.read:any`, so the whole five-tool catalogue is offered and the
 * expiry case is scorable. A plain doctor would not be offered expiry at all,
 * and scoring an unoffered tool would measure the ability filter rather than
 * the model.
 */
const EVAL_CALLER = {
  user: { sub: '00000000-0000-4000-8000-000000000001', email: 'eval@hms.local' },
  roleCodes: ['DOCTOR'],
  permissions: [
    { resource: 'Medication', action: 'read', scope: 'ANY' as const },
    { resource: 'Inventory', action: 'read', scope: 'ANY' as const },
    { resource: 'Patient', action: 'read', scope: 'OWN' as const },
    { resource: 'Appointment', action: 'read', scope: 'OWN' as const },
  ],
};

function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function printReport(providerKind: string, model: string, report: ToolSelectionEvalReport): void {
  process.stdout.write(`\nProvider kind: ${providerKind}  model: ${model}\n`);
  process.stdout.write(`Cases: ${report.totalCases}\n`);
  process.stdout.write(`  Correct-tool rate : ${formatPercentage(report.correctToolRate)}\n`);
  process.stdout.write(`  Correct-args rate : ${formatPercentage(report.correctArgsRate)}\n`);
  process.stdout.write(`  False-tool rate   : ${formatPercentage(report.falseToolRate)}\n`);
  process.stdout.write(`  Missed-tool rate  : ${formatPercentage(report.missedToolRate)}\n`);
  process.stdout.write(`  Clarify rate      : ${formatPercentage(report.clarifyRate)}\n`);
  process.stdout.write(`  Counts: ${JSON.stringify(report.counts)}\n\n`);
  // Every failing case is printed with its id, because an aggregate that
  // dropped from 90% to 70% is not actionable until you can see which cases
  // moved.
  for (const result of report.results) {
    if (result.outcome === 'CORRECT_TOOL' && result.hasCorrectArguments) {
      continue;
    }
    process.stdout.write(
      `  ${result.caseId}: ${result.outcome}${
        result.outcome === 'CORRECT_TOOL' ? ' (wrong arguments)' : ''
      }\n`,
    );
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const registry = app.get(ChatToolRegistry);
    const resolver = app.get(AiProviderResolverService);
    if (!registry.hasRegisteredTools()) {
      throw new Error(
        'No tools are registered — run with AI_CHAT_TOOLS_ENABLED=true, or the eval measures nothing.',
      );
    }
    const { adapter, config } = await resolver.resolveActiveProvider();
    const tools = buildChatToolWireDefinitions(registry.listOfferedTools(EVAL_CALLER, 'DOCTOR'));
    const observations: ToolSelectionEvalObservation[] = [];
    for (const evalCase of TOOL_SELECTION_EVAL_SET) {
      const result = await adapter.sendChatCompletion(config, {
        sessionExternalId: null,
        channel: 'DOCTOR',
        messages: [
          { role: 'system', content: AI_CHAT_SYSTEM_PROMPTS.DOCTOR },
          { role: 'user', content: evalCase.question },
        ],
        contextPayload: {},
        tools,
      });
      const firstCall = result.toolCalls[0];
      observations.push({
        caseId: evalCase.id,
        calledTool: firstCall?.name ?? null,
        calledArguments:
          firstCall === undefined ? null : (firstCall.arguments as Record<string, unknown>),
        replyText: result.content,
      });
      process.stdout.write('.');
    }
    printReport(
      config.providerKind,
      config.model,
      scoreToolSelection(TOOL_SELECTION_EVAL_SET, observations),
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Tool-selection eval failed: ${err instanceof Error ? err.message : ''}\n`);
  process.exitCode = 1;
});
