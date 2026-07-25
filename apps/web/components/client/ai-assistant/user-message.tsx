'use client';

import { AvatarInitials } from '#components/shared/avatar-initials';
import type { UserConversationMessage } from '#lib/ai-assistant/conversation-types';

type UserMessageProps = {
  message: UserConversationMessage;
};

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex flex-row-reverse gap-4">
      <AvatarInitials name={message.authorName} size="sm" className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-slate-400">{message.sentAtLabel}</span>
          <span className="text-sm font-medium text-slate-900">{message.authorName}</span>
        </div>
        <div className="inline-block max-w-prose rounded-2xl rounded-tr-none bg-primary px-4 py-2 text-left text-[15px] leading-relaxed text-primary-foreground shadow-sm">
          {message.text}
        </div>
      </div>
    </div>
  );
}
