'use client';

import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

/**
 * The rule that keeps a personal knowledge base inside risk class A
 * (ai-chatbot-tools.md §5.1 A): **no patient data in a knowledge base.**
 *
 * Retrieved chunks are sent to the AI provider like any other context, so a
 * clinician pasting patient notes into their corpus would route corpus B to a
 * processor through the side door — without a tool call, without a consent
 * check, and without anything in the transcript showing it happened.
 *
 * It renders at the point of upload rather than in help text or a settings
 * page, because the moment someone is choosing a file is the only moment the
 * warning can change what they do. Styled as a standing condition rather than
 * an error: it is always true, not a reaction to a mistake.
 */
export function NoPatientDataNotice() {
  const t = useTranslations('personalKnowledgeBase.notice');

  return (
    <InlineNotice tone="warning" title={t('title')}>
      {t('body')}
    </InlineNotice>
  );
}
