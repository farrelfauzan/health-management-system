'use client';

import { useTranslations } from 'next-intl';

type AutomaticDetailsNoticeProps = {
  pagePath: string;
  requestIdCount: number;
};

/**
 * What the report carries besides the reporter's words (P23-T11).
 *
 * Read-only and stated plainly, because the reporter is being asked to take
 * responsibility for what leaves the clinic — and they cannot do that for fields
 * they do not know are attached. It names the page, the browser, the version and
 * how many recent failed-request ids ride along.
 *
 * The page path shown is the cleaned one: the query string and hash are gone and
 * record ids are `:id`, because that is what will actually be sent, and showing
 * the raw route here would be reassuring about the wrong string.
 */
export function AutomaticDetailsNotice({
  pagePath,
  requestIdCount,
}: AutomaticDetailsNoticeProps) {
  const t = useTranslations('authShell.bugReport');
  return (
    <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
      {t('automaticDetails', { pagePath, count: requestIdCount })}
    </p>
  );
}
