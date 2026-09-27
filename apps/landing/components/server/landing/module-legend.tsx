import type { ReactElement } from 'react';

import { MODULE_GROUPS } from '#lib/landing/module-groups';

/** Colour key for the module badge families. */
export function ModuleLegend(): ReactElement {
  return (
    <ul className="hidden gap-6 text-sm font-semibold text-ink-muted xl:flex">
      {Object.values(MODULE_GROUPS).map((group) => (
        <li key={group.id} className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: group.color }}
            aria-hidden="true"
          />
          {group.label}
        </li>
      ))}
    </ul>
  );
}
