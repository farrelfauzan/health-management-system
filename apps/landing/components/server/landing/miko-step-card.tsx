import type { ReactElement } from 'react';

import { MikoMascot } from '#components/shared/miko-mascot';
import type { MikoMood } from '#lib/landing/miko-mood';

type MikoStepCardProps = {
  mood: MikoMood;
  step: string;
  title: string;
  description: string;
};

/** One moment of a WhatsApp conversation, told through one of Miko's expressions. */
export function MikoStepCard({ mood, step, title, description }: MikoStepCardProps): ReactElement {
  return (
    <article className="flex items-center gap-3.5 rounded-[22px] border border-line bg-canvas p-4 xl:flex-col xl:items-stretch xl:gap-2 xl:rounded-[28px] xl:px-7 xl:pt-6 xl:pb-7">
      <div className="flex h-[124px] w-28 shrink-0 items-center justify-center rounded-2xl bg-mist xl:mb-4 xl:h-[196px] xl:w-auto xl:rounded-[20px]">
        <MikoMascot mood={mood} className="size-[104px] xl:size-[180px]" />
      </div>
      <div className="flex flex-col gap-1 xl:gap-2">
        <span className="font-mono text-xs text-ink-muted xl:text-[13px]">{step}</span>
        <h3 className="text-lg font-extrabold xl:text-[22px]">{title}</h3>
        <p className="text-sm leading-normal text-ink-muted xl:text-base xl:leading-[1.55]">
          {description}
        </p>
      </div>
    </article>
  );
}
