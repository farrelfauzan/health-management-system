'use client';

import { useState, type KeyboardEvent } from 'react';
import { Button, Icon, Textarea } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ChatComposerProps = {
  isBusy: boolean;
  onSend: (text: string) => void;
};

export function ChatComposer({ isBusy, onSend }: ChatComposerProps) {
  const t = useTranslations('aiAssistant.composer');
  const [draft, setDraft] = useState('');
  const canSend = draft.trim().length > 0 && !isBusy;
  function submitDraft(): void {
    if (!canSend) {
      return;
    }
    onSend(draft.trim());
    setDraft('');
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitDraft();
    }
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('placeholder')}
        aria-label={t('messageLabel')}
        className="min-h-24 resize-none border-none shadow-none focus-visible:border-transparent focus-visible:ring-0"
      />
      <div className="flex items-center justify-end gap-1 px-3 pb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          title={t('attachmentsUnavailable')}
          aria-label={t('attachFile')}
        >
          <Icon name="attach_file" size={20} className="text-current" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          title={t('voiceUnavailable')}
          aria-label={t('recordVoice')}
        >
          <Icon name="mic" size={20} className="text-current" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={submitDraft}
          disabled={!canSend}
          aria-label={t('send')}
        >
          <Icon name="send" size={20} className="text-current" />
        </Button>
      </div>
    </div>
  );
}
