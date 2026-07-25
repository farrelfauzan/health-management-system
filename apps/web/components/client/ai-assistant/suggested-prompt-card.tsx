'use client';

import type { SuggestedPrompt } from '#lib/ai-assistant/mock-suggested-prompts';

type SuggestedPromptCardProps = {
  prompt: SuggestedPrompt;
  isDisabled: boolean;
  onSelect: (prompt: SuggestedPrompt) => void;
};

export function SuggestedPromptCard({ prompt, isDisabled, onSelect }: SuggestedPromptCardProps) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onSelect(prompt)}
      className="group w-full rounded-lg border border-slate-200 p-3 text-left text-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="block font-medium text-slate-900 group-hover:text-primary">
        {prompt.title}
      </span>
      <span className="text-xs text-slate-400">{prompt.description}</span>
    </button>
  );
}
