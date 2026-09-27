import type { ReactElement } from 'react';

import { ModuleExplorer } from '#components/client/landing/module-explorer';
import { ModuleLegend } from '#components/server/landing/module-legend';
import { SectionEyebrow } from '#components/shared/section-eyebrow';
import { LANDING_MODULES } from '#lib/landing/landing-modules';
import { MODULE_GROUPS } from '#lib/landing/module-groups';

/** Every module as a badge; picking one shows its workflow. */
export function ModulesSection(): ReactElement {
  return (
    <section id="modul" className="bg-canvas">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-16 xl:gap-8 xl:px-20 xl:py-24">
        <div className="rv flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
          <div className="flex flex-col gap-3 xl:gap-3.5">
            <SectionEyebrow>Semua modul</SectionEyebrow>
            <h2 className="text-[32px] leading-[1.15] font-extrabold tracking-[-0.03em] xl:text-5xl xl:leading-[1.1]">
              Satu sistem, semua kebutuhan klinik.
            </h2>
          </div>
          <p className="max-w-[420px] text-[15px] leading-normal text-ink-muted xl:text-lg">
            Klik salah satu modul untuk melihat alur kerjanya, langkah demi langkah.
          </p>
        </div>
        <ModuleLegend />
        <ModuleExplorer modules={LANDING_MODULES} groups={MODULE_GROUPS} />
      </div>
    </section>
  );
}
