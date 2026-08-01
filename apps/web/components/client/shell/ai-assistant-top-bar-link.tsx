'use client';

import Link from 'next/link';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useOptionalAiAssistant } from '#lib/ai-assistant/ai-assistant-context';
import { ASSISTANT_PATH } from '#lib/ai-assistant/assistant-path';

type AiAssistantTopBarLinkProps = {
  label: string;
};

/**
 * The top bar's assistant entry point, extracted from `TopBar` because the
 * unread count is client state and the bar is a server component. It replaces
 * the decorative dot that used to sit there permanently — a marker that never
 * changed could not tell anyone a reply had arrived.
 */
export function AiAssistantTopBarLink({ label }: AiAssistantTopBarLinkProps) {
  const t = useTranslations('aiAssistant.unread');
  const assistant = useOptionalAiAssistant();
  const unreadCount = assistant?.unreadCount ?? 0;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative rounded-full text-muted-foreground"
    >
      <Link href={ASSISTANT_PATH} aria-label={label}>
        <Icon name="smart_toy" size={22} />
        {unreadCount > 0 ? (
          <span
            role="status"
            aria-label={t('label', { count: unreadCount })}
            className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full border-2 border-card bg-secondary px-1 text-[10px] font-semibold leading-4 text-secondary-foreground"
          >
            <span aria-hidden="true">{unreadCount}</span>
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
