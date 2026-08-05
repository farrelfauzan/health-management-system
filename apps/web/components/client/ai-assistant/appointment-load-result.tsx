'use client';

import type { GetAppointmentLoadToolResult } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ToolResultHeadline } from '#components/client/ai-assistant/tool-result-headline';
import { ToolResultNotice } from '#components/client/ai-assistant/tool-result-notice';

type AppointmentLoadResultProps = {
  result: GetAppointmentLoadToolResult;
};

/**
 * `get_appointment_load` — how full the practice sessions are over the window.
 * Capacity is nullable because an open session has no cap, and that is
 * rendered as "tanpa batas" rather than as a blank cell or a zero: a session
 * with no ceiling is a different fact from a session with no room.
 */
export function AppointmentLoadResult({ result }: AppointmentLoadResultProps) {
  const t = useTranslations('aiAssistant.toolResults');
  if (result.items.length === 0) {
    return <ToolResultNotice message={t('loadEmpty')} />;
  }
  return (
    <div className="space-y-2">
      <ToolResultHeadline
        text={t('loadHeadline', {
          booked: result.totalBooked,
          sessions: result.sessionCount,
        })}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('loadColumns.session')}</TableHead>
              <TableHead>{t('loadColumns.doctor')}</TableHead>
              <TableHead className="text-right">{t('loadColumns.booked')}</TableHead>
              <TableHead className="text-right">{t('loadColumns.capacity')}</TableHead>
              <TableHead className="text-right">{t('loadColumns.remaining')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/*
              Keyed by position, not by content: the §4.3 projection strips
              every id, and date + time + doctor is not unique — one clinician
              runs the same slot in two poli, and that collision made React
              drop a row. The list is a frozen snapshot of one lookup, never
              reordered or filtered, which is exactly when an index key is the
              honest one.
            */}
            {result.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell className="whitespace-nowrap">
                  <span className="font-medium text-slate-900">{item.sessionDate}</span>
                  <span className="block text-xs text-slate-500">
                    {item.startTime}–{item.endTime}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-slate-900">{item.doctorName}</span>
                  {item.specialty === undefined ? null : (
                    <span className="block text-xs text-slate-500">{item.specialty}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.bookedCount}</TableCell>
                <TableCell className="text-right tabular-nums text-slate-500">
                  {item.maxPatients ?? t('loadUncapped')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.remaining ?? t('loadUncapped')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
