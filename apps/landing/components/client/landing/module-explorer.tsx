'use client';

import { useState, type ReactElement } from 'react';

import { ModuleChip } from '#components/client/landing/module-chip';
import { ModuleFlowPanel } from '#components/client/landing/module-flow-panel';
import type { LandingModule } from '#lib/landing/landing-module';
import type { ModuleGroup } from '#lib/landing/module-group';
import type { ModuleGroupId } from '#lib/landing/module-group-id';

type ModuleExplorerProps = {
  modules: readonly LandingModule[];
  groups: Readonly<Record<ModuleGroupId, ModuleGroup>>;
};

/** The module badges and the workflow of whichever badge is picked. */
export function ModuleExplorer({ modules, groups }: ModuleExplorerProps): ReactElement {
  const [activeId, setActiveId] = useState<string>(modules[0]?.id ?? '');
  const activeModule = modules.find((module) => module.id === activeId) ?? modules[0];
  return (
    <div className="flex flex-col gap-5 xl:gap-8">
      <div
        role="group"
        aria-label="Pilih modul"
        className="rv -mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] pb-1.5 xl:mx-0 xl:flex-wrap xl:gap-2.5 xl:overflow-visible xl:px-0 xl:pb-0"
      >
        {modules.map((module) => (
          <ModuleChip
            key={module.id}
            module={module}
            group={groups[module.groupId]}
            isActive={module.id === activeModule?.id}
            onSelect={setActiveId}
          />
        ))}
      </div>
      {activeModule && (
        <ModuleFlowPanel
          key={activeModule.id}
          module={activeModule}
          group={groups[activeModule.groupId]}
        />
      )}
    </div>
  );
}
