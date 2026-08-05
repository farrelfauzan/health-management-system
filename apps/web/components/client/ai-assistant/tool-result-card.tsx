'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultBody } from '#components/client/ai-assistant/tool-result-body';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';
import { resolveToolResultScope } from '#lib/ai-assistant/tool-result-scope';
import { resolveToolResultTitleKey } from '#lib/ai-assistant/tool-result-title-key';

type ToolResultCardProps = {
  toolResult: ParsedToolResult;
};

/**
 * One lookup, framed so the reader can see *what* was asked as well as what
 * came back. Naming the lookup and its scope is what makes a wrong tool
 * choice visible immediately (§4.7): a doctor who asked about stock and sees
 * an expiry card headed "hingga 2026-09-01" spots the mismatch without having
 * to check the numbers against the pharmacy screen.
 */
export function ToolResultCard({ toolResult }: ToolResultCardProps) {
  const t = useTranslations('aiAssistant.toolResults');
  const scope = resolveToolResultScope(toolResult);
  return (
    <section className="max-w-prose overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <Icon name="database" size={16} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-900">
          {t(resolveToolResultTitleKey(toolResult))}
        </span>
        <span className="ml-auto truncate text-xs text-slate-500">
          {scope === null ? null : t(scope.key, scope.values)}
        </span>
      </header>
      <div className="px-3 py-2">
        <ToolResultBody toolResult={toolResult} />
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
        {t('sourceNote')}
      </p>
    </section>
  );
}
