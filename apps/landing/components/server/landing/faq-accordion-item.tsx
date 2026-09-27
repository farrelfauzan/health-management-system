import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';
import type { FaqItem } from '#lib/landing/faq-item';

type FaqAccordionItemProps = {
  item: FaqItem;
};

/** One question that expands to its answer; native `<details>`, so it works without JavaScript. */
export function FaqAccordionItem({ item }: FaqAccordionItemProps): ReactElement {
  return (
    <details className="faq-item group border-b border-line">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-5 text-left xl:py-6">
        <h3 className="text-[17px] leading-snug font-bold group-open:text-brand xl:text-lg">
          {item.question}
        </h3>
        <span className="faq-chevron mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-mist text-brand">
          <LineIcon name="chevron-down" size={18} />
        </span>
      </summary>
      <p className="faq-answer pr-12 pb-6 text-[15px] leading-relaxed text-ink-muted xl:text-base">
        {item.answer}
      </p>
    </details>
  );
}
