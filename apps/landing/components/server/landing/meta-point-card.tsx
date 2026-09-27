import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';
import type { MetaPoint } from '#lib/landing/meta-point';

type MetaPointCardProps = {
  point: MetaPoint;
};

/** One reason card under "Lebih dari sekadar RME." */
export function MetaPointCard({ point }: MetaPointCardProps): ReactElement {
  return (
    <article className="flex flex-col gap-2.5 rounded-[22px] border border-line bg-canvas p-[22px] xl:gap-3 xl:rounded-3xl xl:p-8">
      <div className="flex items-center gap-3 xl:flex-col xl:items-start xl:gap-0">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-white xl:mb-3 xl:size-14 xl:rounded-[18px]"
          style={{ backgroundColor: point.color }}
        >
          <LineIcon name={point.icon} size={24} />
        </span>
        <h3 className="text-lg leading-tight font-extrabold xl:text-[21px]">{point.title}</h3>
      </div>
      <p className="text-[15px] leading-[1.55] text-ink-muted xl:text-base">{point.description}</p>
    </article>
  );
}
