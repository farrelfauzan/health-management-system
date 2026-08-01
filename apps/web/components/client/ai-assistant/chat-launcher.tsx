'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Can, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ASSISTANT_PATH } from '#lib/ai-assistant/assistant-path';
import { useChatAvailability } from '#lib/ai-assistant/use-chat-availability';

/**
 * The floating chat entry point (ai-chatbot.md §8). It is hidden three ways,
 * each for a different reason: CASL hides it from users without the chat
 * grant, the availability check hides it when the clinic has chat off or no
 * usable provider — an entry point that leads straight to an empty state is
 * worse than no entry point — and it hides itself on the assistant screen,
 * where a button linking to the page you are on is noise.
 *
 * Rendered only while availability is known to be true, so the button never
 * flashes in and out during the first load.
 */
export function ChatLauncher() {
  const t = useTranslations('aiAssistant.launcher');
  const pathname = usePathname();
  const availabilityQuery = useChatAvailability();

  if (pathname === ASSISTANT_PATH || availabilityQuery.data?.isAvailable !== true) {
    return null;
  }

  return (
    <Can action="create" subject="ChatSession">
      <Link
        href={ASSISTANT_PATH}
        aria-label={t('open')}
        title={t('open')}
        className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="smart_toy" size={24} className="text-current" />
      </Link>
    </Can>
  );
}
