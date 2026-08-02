'use client';

import { Icon } from '@hms/ui';

type ToolResultNoticeProps = {
  message: string;
  detail?: string;
};

/**
 * What a lookup that produced nothing looks like. Empty and failed results
 * render as themselves (ai-chatbot-tools.md §4.5) — never as model-authored
 * prose about what might have been there, and never as an empty table that
 * reads like "we checked and there is none".
 */
export function ToolResultNotice({ message, detail }: ToolResultNoticeProps) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm text-slate-600">
      <Icon name="info" size={16} className="mt-0.5 text-slate-400" />
      <span>
        {message}
        {detail === undefined ? null : (
          <span className="ml-1 font-mono text-xs text-slate-400">{detail}</span>
        )}
      </span>
    </div>
  );
}
