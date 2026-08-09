'use client';

import type { AdminConversationMessageView, ConversationMessageRoleValue } from '@hms/shared-types';
import { cn } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type ConversationTranscriptMessageProps = {
  message: AdminConversationMessageView;
};

/**
 * Four roles, four looks, because the difference between them is the single
 * most important thing on this screen.
 *
 * `SYSTEM` is separated from `BOT` for the reason the schema separates them: a
 * reply that never reached a provider — an emergency template, the privacy
 * notice, a booking confirmation this codebase worded itself — is a different
 * fact for an auditor than one a model composed, and an admin reading back a
 * conversation needs to know which sentences the clinic guaranteed.
 */
const ROLE_CLASS_NAMES: Record<ConversationMessageRoleValue, string> = {
  CUSTOMER: 'bg-white border-slate-200',
  BOT: 'bg-slate-50 border-slate-200',
  ADMIN: 'bg-emerald-50 border-emerald-200',
  SYSTEM: 'bg-sky-50 border-sky-200',
};

export function ConversationTranscriptMessage({ message }: ConversationTranscriptMessageProps) {
  const t = useTranslations('conversations.transcript');
  const format = useFormatter();
  const isTranscriptTurn = !message.safetyTags.includes('tool_invocation');

  return (
    <li
      className={cn(
        'rounded-lg border px-4 py-3',
        ROLE_CLASS_NAMES[message.role],
        message.role === 'ADMIN' ? 'ml-8' : 'mr-8',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t(`roles.${message.role}`)}
          {message.authorEmail === null ? '' : ` · ${message.authorEmail}`}
        </span>
        <span className="text-xs text-slate-500">
          {format.dateTime(new Date(message.createdAt), { timeStyle: 'short' })}
        </span>
      </div>
      {/* A tool call is audit, not conversation. It is rendered in monospace
          and dimmed so an admin reading the exchange can skip it, rather than
          hidden — the lookup that produced an answer is exactly what someone
          investigating a wrong answer needs to see. */}
      <p
        className={cn(
          'mt-1 whitespace-pre-wrap text-sm',
          isTranscriptTurn ? 'text-slate-800' : 'font-mono text-xs text-slate-500',
        )}
      >
        {message.content}
      </p>
      {message.safetyTags.length > 0 ? (
        <p className="mt-2 flex flex-wrap gap-2">
          {message.safetyTags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-slate-200 px-2 py-0.5 text-[0.7rem] font-medium text-slate-700"
            >
              {tag}
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
}
