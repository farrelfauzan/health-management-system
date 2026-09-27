import type { ReactElement } from 'react';

import { LineIcon } from '#components/shared/line-icon';

/** The floating "visit booked" confirmation next to Miko in the hero. */
export function HeroBookingCard(): ReactElement {
  return (
    <div className="in-drop absolute top-9 -right-2 hidden w-[236px] flex-col gap-2 rounded-[18px] border border-line bg-white px-[18px] py-4 shadow-[0_18px_40px_-18px_rgba(11,28,48,.28)] xl:flex">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-mint text-teal-deep">
          <LineIcon name="check" size={16} />
        </span>
        <span className="text-[15px] font-bold">Kunjungan terdaftar</span>
      </div>
      <p className="font-mono text-[13px] whitespace-nowrap">Rab, 30 Sep · 08.00–11.00</p>
      <p className="text-[13px] text-ink-muted">Poli Umum · Sesi pagi</p>
    </div>
  );
}
