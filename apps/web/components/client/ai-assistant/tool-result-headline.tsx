'use client';

type ToolResultHeadlineProps = {
  text: string;
};

/**
 * The one sentence that answers the question, computed from the looked-up
 * numbers rather than written by the model.
 *
 * Mode A forbids the assistant's own text from stating a result
 * (ai-chatbot-tools.md §4.5), so the reply above a lookup only ever announces
 * it — "Saya cek antrean hari ini." A table alone therefore leaves the user to
 * do the reading, which is what made a correct answer feel like no answer.
 * This is the compromise the rule allows: still not model prose, just the
 * data said in words.
 */
export function ToolResultHeadline({ text }: ToolResultHeadlineProps) {
  return <p className="text-sm font-medium text-slate-900">{text}</p>;
}
