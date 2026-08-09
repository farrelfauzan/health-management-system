'use client';

import type { ConversationStateValue } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ConversationStateBadgeProps = {
  state: ConversationStateValue;
  isBlocked: boolean;
};

/**
 * How each state reads at a glance.
 *
 * `NEEDS_HUMAN` is the only warm colour, and that is the whole design: this
 * badge appears in a list an admin scans, and if three states shout then none
 * of them does. Everything else is neutral because everything else is either
 * fine or somebody else's turn.
 */
const STATE_CLASS_NAMES: Record<ConversationStateValue, string> = {
  BOT_ACTIVE: 'bg-slate-100 text-slate-700',
  NEEDS_HUMAN: 'bg-amber-100 text-amber-900',
  HUMAN_ACTIVE: 'bg-emerald-100 text-emerald-900',
  AWAITING_OTP: 'bg-sky-100 text-sky-900',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

export function ConversationStateBadge({ state, isBlocked }: ConversationStateBadgeProps) {
  const t = useTranslations('conversations.states');

  // A block outranks the state rather than replacing it, because it *is* an
  // overlay on the server too: the conversation is still whatever it was, and
  // unblocking returns it there. Showing both would need two badges in a
  // column that has room for one, so the louder fact wins.
  if (isBlocked) {
    return <Badge className="bg-red-100 text-red-900">{t('BLOCKED')}</Badge>;
  }
  return <Badge className={STATE_CLASS_NAMES[state]}>{t(state)}</Badge>;
}
