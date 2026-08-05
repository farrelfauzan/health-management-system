'use client';

import { useTranslations } from 'next-intl';

import { AppointmentLoadResult } from '#components/client/ai-assistant/appointment-load-result';
import { CashierReportResult } from '#components/client/ai-assistant/cashier-report-result';
import { MedicationExpiryResult } from '#components/client/ai-assistant/medication-expiry-result';
import { MedicationStockResult } from '#components/client/ai-assistant/medication-stock-result';
import { QueueBoardResult } from '#components/client/ai-assistant/queue-board-result';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

type ToolResultBodyProps = {
  toolResult: ParsedToolResult;
};

/**
 * One lookup's payload, dispatched to the component that knows its shape.
 * A switch rather than a chain of ternaries in the card: with five renderable
 * tools plus two failure states, the exhaustiveness is the point — a new tool
 * that forgets a case falls through to the notice instead of rendering blank.
 */
export function ToolResultBody({ toolResult }: ToolResultBodyProps) {
  const t = useTranslations('aiAssistant.toolResults');
  switch (toolResult.kind) {
    case 'STOCK':
      return <MedicationStockResult result={toolResult.result} />;
    case 'EXPIRY':
      return <MedicationExpiryResult result={toolResult.result} />;
    case 'QUEUE':
      return <QueueBoardResult result={toolResult.result} />;
    case 'CASHIER':
      return <CashierReportResult result={toolResult.result} />;
    case 'APPOINTMENT_LOAD':
      return <AppointmentLoadResult result={toolResult.result} />;
    case 'FAILED':
      return (
        <ToolResultNotice
          message={t('failed')}
          {...(toolResult.errorCode === null
            ? {}
            : { detail: t('failedCode', { errorCode: toolResult.errorCode }) })}
        />
      );
    default:
      return <ToolResultNotice message={t('unrenderable')} />;
  }
}
