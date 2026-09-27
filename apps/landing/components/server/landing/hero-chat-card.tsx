import type { ReactElement } from 'react';

import { BrandMark } from '#components/shared/brand-mark';

/** A sample WhatsApp exchange with Miko: a patient asks for a schedule and gets two sessions. */
export function HeroChatCard(): ReactElement {
  return (
    <div className="in-slide absolute top-[250px] right-3 left-3 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_24px_48px_-20px_rgba(11,28,48,.30)] xl:top-[372px] xl:right-auto xl:-left-16 xl:w-[336px] xl:rounded-[22px]">
      <div className="flex items-center gap-2.5 border-b border-[#eef1f6] px-3.5 py-3 xl:px-4 xl:py-3.5">
        <span className="flex size-[30px] items-center justify-center rounded-full bg-mist xl:size-[34px]">
          <BrandMark className="size-[22px] xl:size-[26px]" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold xl:text-sm">Miko · Meta Klinik</span>
          <span className="hidden text-xs font-semibold text-teal-deep xl:block">
            Asisten WhatsApp klinik
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-2 bg-canvas p-3.5 text-[13px] leading-[1.45] xl:gap-2.5 xl:p-4 xl:text-sm">
        <p className="max-w-[230px] self-end rounded-[14px_14px_4px_14px] border border-line bg-white px-3 py-2 xl:rounded-[16px_16px_4px_16px] xl:px-3.5 xl:py-2.5">
          Dokter umum besok praktik jam berapa?
        </p>
        <p className="max-w-[250px] self-start rounded-[14px_14px_14px_4px] bg-brand px-3 py-2 text-white xl:rounded-[16px_16px_16px_4px] xl:px-3.5 xl:py-2.5">
          Besok ada dua sesi: <span className="font-mono text-xs xl:text-[13px]">08.00–11.00</span>{' '}
          dan <span className="font-mono text-xs xl:text-[13px]">16.00–19.00</span>. Mau saya
          daftarkan?
        </p>
        <p className="hidden max-w-[230px] self-end rounded-[16px_16px_4px_16px] border border-line bg-white px-3.5 py-2.5 xl:block">
          Yang pagi ya
        </p>
      </div>
    </div>
  );
}
