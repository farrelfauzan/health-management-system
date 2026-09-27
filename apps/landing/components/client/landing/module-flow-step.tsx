'use client';

import type { ReactElement } from 'react';

import type { FlowStep } from '#lib/landing/flow-step';

type ModuleFlowStepProps = {
  step: FlowStep;
  position: number;
  color: string;
};

/** One numbered step: stacked on phones, a column of the five-step row on desktop. */
export function ModuleFlowStep({ step, position, color }: ModuleFlowStepProps): ReactElement {
  return (
    <li className="relative flex items-start gap-3.5 xl:flex-col xl:gap-2">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-[14px] font-mono text-sm font-medium text-white xl:mb-3 xl:size-14 xl:rounded-[18px] xl:text-base"
        style={{ backgroundColor: color }}
      >
        {String(position).padStart(2, '0')}
      </span>
      <div className="flex flex-col gap-1 pt-0.5 xl:gap-2 xl:pt-0">
        <h4 className="text-[17px] leading-tight font-extrabold xl:text-[19px]">{step.title}</h4>
        <p className="text-[15px] leading-normal text-ink-muted xl:leading-[1.55]">
          {step.description}
        </p>
      </div>
    </li>
  );
}
