import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';
import type { LineIconName } from '#lib/landing/line-icon-name';

type FeatureListItemProps = {
  icon: LineIconName;
  tone: 'brand' | 'teal';
  children: string;
};

/** An icon tile followed by one sentence, for the migration and security lists. */
export function FeatureListItem({ icon, tone, children }: FeatureListItemProps): ReactElement {
  const tileClassName = tone === 'brand' ? 'bg-white text-brand' : 'bg-mint text-teal-deep';
  return (
    <li className="flex items-start gap-3.5 xl:gap-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] xl:size-10 xl:rounded-xl ${tileClassName}`}
      >
        <LineIcon name={icon} size={20} />
      </span>
      <p className="mt-1.5 text-base leading-normal xl:mt-2 xl:text-[17px]">{children}</p>
    </li>
  );
}
