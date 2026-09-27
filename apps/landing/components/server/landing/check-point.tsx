import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';

type CheckPointProps = {
  label: string;
};

/** A short reassurance line with a teal check, used under the hero buttons. */
export function CheckPoint({ label }: CheckPointProps): ReactElement {
  return (
    <span className="flex items-center gap-2">
      <LineIcon name="check" size={18} className="text-teal-deep" />
      {label}
    </span>
  );
}
