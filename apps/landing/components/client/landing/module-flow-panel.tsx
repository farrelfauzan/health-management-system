'use client';

import type { ReactElement } from 'react';

import { ModuleFlowStep } from '#components/client/landing/module-flow-step';
import { LineIcon } from '#components/shared/line-icon';
import type { LandingModule } from '#lib/landing/landing-module';
import type { ModuleGroup } from '#lib/landing/module-group';

type ModuleFlowPanelProps = {
  module: LandingModule;
  group: ModuleGroup;
};

/** The picked module: its name, one-line summary and five-step workflow. */
export function ModuleFlowPanel({ module, group }: ModuleFlowPanelProps): ReactElement {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={`Alur ${module.name}`}
      className="panel flex flex-col gap-6 rounded-3xl border border-line bg-white px-5 py-[22px] xl:gap-10 xl:rounded-[28px] xl:p-10"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-5">
        <div className="flex items-center gap-3 xl:gap-5">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-mist xl:size-16 xl:rounded-[20px]"
            style={{ color: group.color }}
          >
            <LineIcon name={module.icon} size={26} />
          </span>
          <div className="flex flex-col gap-0.5 xl:gap-1">
            <span
              className="font-mono text-[11px] tracking-[0.06em] uppercase xl:text-xs"
              style={{ color: group.color }}
            >
              {group.label}
            </span>
            <h3 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em] xl:text-[30px] xl:leading-[1.1]">
              {module.name}
            </h3>
          </div>
        </div>
        <p className="text-base leading-normal font-medium xl:ml-auto xl:max-w-[480px] xl:text-[17px] xl:font-normal xl:text-ink-muted">
          {module.summary}
        </p>
      </div>
      <div className="relative">
        <div
          className="absolute top-[22px] bottom-[60px] left-[21px] w-0.5 bg-[#dce3ef] xl:top-[27px] xl:right-[calc((100%-112px)/5-28px)] xl:bottom-auto xl:left-7 xl:h-0.5 xl:w-auto"
          aria-hidden="true"
        />
        <ol className="relative flex flex-col gap-5 xl:grid xl:grid-cols-5 xl:gap-7">
          {module.steps.map((step, index) => (
            <ModuleFlowStep key={step.title} step={step} position={index + 1} color={group.color} />
          ))}
        </ol>
      </div>
    </div>
  );
}
