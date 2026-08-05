'use client';

import { Icon } from '@hms/ui';

import { AssistantDisclaimer } from '#components/client/ai-assistant/assistant-disclaimer';
import { ClinicalReferenceChips } from '#components/client/ai-assistant/clinical-reference-chips';
import { MarkdownBlockView } from '#components/client/ai-assistant/markdown-block-view';
import { MarkdownInline } from '#components/client/ai-assistant/markdown-inline';
import { ToolResultList } from '#components/client/ai-assistant/tool-result-list';
import type { AssistantConversationMessage } from '#lib/ai-assistant/conversation-types';
import { parseMarkdownBlock } from '#lib/ai-assistant/parse-markdown-block';

type AssistantMessageProps = {
  message: AssistantConversationMessage;
};

export function AssistantMessage({ message }: AssistantMessageProps) {
  return (
    <div className="flex gap-4">
      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
        <Icon name="smart_toy" size={20} className="text-current" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{message.authorName}</span>
          <span className="text-xs text-slate-400">{message.sentAtLabel}</span>
        </div>
        <div className="max-w-prose space-y-3 text-[15px] leading-relaxed text-slate-800">
          {/*
            Each paragraph is a blank-line chunk of the reply, classified on
            render: models write markdown whatever the prompt asks for, and
            rendering it verbatim put "**Dokter**" on screen, asterisks and
            all. Parsing here rather than at the boundary keeps the stored
            transcript exactly as the model wrote it.
          */}
          {message.body.paragraphs.map((paragraph, index) => (
            <MarkdownBlockView key={index} block={parseMarkdownBlock(paragraph)} />
          ))}
          {message.body.bullets && message.body.bullets.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5">
              {message.body.bullets.map((bullet, index) => (
                <li key={index}>
                  <MarkdownInline text={bullet} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {/*
          Directly under the text, above references and the disclaimer: in
          Mode A the reply announces the lookup and this is what it announced,
          so the two read as one answer rather than as a footnote.
        */}
        {message.body.toolResults && message.body.toolResults.length > 0 ? (
          <ToolResultList toolResults={message.body.toolResults} />
        ) : null}
        {message.body.references && message.body.references.length > 0 ? (
          <ClinicalReferenceChips references={message.body.references} />
        ) : null}
        {message.body.suggestionNote ? (
          <p className="text-xs italic text-slate-500">{message.body.suggestionNote}</p>
        ) : null}
        {message.body.disclaimer ? (
          <AssistantDisclaimer disclaimer={message.body.disclaimer} />
        ) : null}
      </div>
    </div>
  );
}
