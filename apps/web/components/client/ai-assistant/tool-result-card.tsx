'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { MedicationExpiryResult } from '#components/client/ai-assistant/medication-expiry-result';
import { MedicationStockResult } from '#components/client/ai-assistant/medication-stock-result';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

type ToolResultCardProps = {
  toolResult: ParsedToolResult;
};

/**
 * One lookup, framed so a clinician can see *what* was asked as well as what
 * came back. Naming the lookup and its scope is what makes a wrong tool
 * choice visible immediately (§4.7): a doctor who asked about stock and sees
 * an expiry card headed "hingga 2026-09-01" spots the mismatch without having
 * to check the numbers against the pharmacy screen.
 */
export function ToolResultCard({ toolResult }: ToolResultCardProps) {
  const t = useTranslations('aiAssistant.toolResults');
  const title =
    toolResult.kind === 'STOCK'
      ? t('stockTitle')
      : toolResult.kind === 'EXPIRY'
        ? t('expiryTitle')
        : toolResult.toolName;
  return (
    <section className="max-w-prose overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <Icon name="database" size={16} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-900">{title}</span>
        <span className="ml-auto truncate text-xs text-slate-500">
          {toolResult.kind === 'STOCK'
            ? toolResult.result.medicationName === null
              ? t('allMedications')
              : t('searchedFor', { medicationName: toolResult.result.medicationName })
            : null}
          {toolResult.kind === 'EXPIRY'
            ? t('throughDate', { throughDate: toolResult.result.throughDate })
            : null}
        </span>
      </header>
      <div className="px-3 py-2">
        {toolResult.kind === 'STOCK' ? <MedicationStockResult result={toolResult.result} /> : null}
        {toolResult.kind === 'EXPIRY' ? (
          <MedicationExpiryResult result={toolResult.result} />
        ) : null}
        {toolResult.kind === 'FAILED' ? (
          <ToolResultNotice
            message={t('failed')}
            {...(toolResult.errorCode === null
              ? {}
              : { detail: t('failedCode', { errorCode: toolResult.errorCode }) })}
          />
        ) : null}
        {toolResult.kind === 'UNRENDERABLE' ? (
          <ToolResultNotice message={t('unrenderable')} />
        ) : null}
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
        {t('sourceNote')}
      </p>
    </section>
  );
}
