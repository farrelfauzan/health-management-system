'use client';

import type { GetQueueBoardSummaryToolResult } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultHeadline } from '#components/client/ai-assistant/tool-result-headline';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';

type QueueBoardResultProps = {
  result: GetQueueBoardSummaryToolResult;
};

/**
 * `get_queue_board_summary` — the clinic-wide counts as the headline, then
 * the same five columns per poli. There is no patient row to render here and
 * there never will be: the tool's output schema has no name in it at all
 * (ai-chatbot-tools.md §2.1.2), so "who is waiting" is a question for the
 * queue-board screen and its audit trail.
 */
export function QueueBoardResult({ result }: QueueBoardResultProps) {
  const t = useTranslations('aiAssistant.toolResults');
  const totalQueued = result.waiting + result.pending + result.checkedIn;
  return (
    <div className="space-y-2">
      <ToolResultHeadline
        text={t('queueHeadline', {
          total: totalQueued,
          waiting: result.waiting,
          completed: result.completed,
        })}
      />
      {result.poli.length === 0 ? (
        <ToolResultNotice message={t('queueNoPoli')} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('queueColumns.poli')}</TableHead>
                <TableHead className="text-right">{t('queueColumns.waiting')}</TableHead>
                <TableHead className="text-right">{t('queueColumns.pending')}</TableHead>
                <TableHead className="text-right">{t('queueColumns.checkedIn')}</TableHead>
                <TableHead className="text-right">{t('queueColumns.completed')}</TableHead>
                <TableHead className="text-right">{t('queueColumns.cancelled')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Poli names are not guaranteed unique by the projection. */}
              {result.poli.map((poli, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium text-slate-900">{poli.poliName}</TableCell>
                  <TableCell className="text-right tabular-nums">{poli.waiting}</TableCell>
                  <TableCell className="text-right tabular-nums">{poli.pending}</TableCell>
                  <TableCell className="text-right tabular-nums">{poli.checkedIn}</TableCell>
                  <TableCell className="text-right tabular-nums">{poli.completed}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">
                    {poli.cancelled}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
