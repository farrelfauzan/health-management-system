'use client';

import type { CSSProperties, ReactElement } from 'react';

import type { LandingModule } from '#lib/landing/landing-module';
import type { ModuleGroup } from '#lib/landing/module-group';

type ModuleChipProps = {
  module: LandingModule;
  group: ModuleGroup;
  isActive: boolean;
  onSelect: (moduleId: string) => void;
};

/** A module badge; the active one fills with its family colour. */
export function ModuleChip({ module, group, isActive, onSelect }: ModuleChipProps): ReactElement {
  const activeStyle: CSSProperties | undefined = isActive
    ? { backgroundColor: group.color, borderColor: group.color }
    : undefined;
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => onSelect(module.id)}
      className={isActive ? 'chip is-active' : 'chip'}
      style={activeStyle}
    >
      <span className="chip-dot" style={{ backgroundColor: group.color }} aria-hidden="true" />
      {module.name}
    </button>
  );
}
