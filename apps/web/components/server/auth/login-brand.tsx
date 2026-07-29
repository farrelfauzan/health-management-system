import Image from 'next/image';

import { FACILITY_CONFIG } from '#lib/facility/facility-config';

/**
 * Compact brand for the form column. It carries the identity on small screens,
 * where the visual panel is hidden, and stays as a quiet mark beside the form
 * on large ones.
 */
export function LoginBrand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/saling-jaga-mark.png"
        alt={`${FACILITY_CONFIG.name} logo`}
        width={44}
        height={44}
        priority
        className="size-11 shrink-0 object-contain"
      />
      <span className="flex flex-col">
        <span className="font-heading text-lg font-semibold tracking-tight text-slate-900">
          {FACILITY_CONFIG.name}
        </span>
        <span className="text-xs text-slate-500">Health Management System</span>
      </span>
    </div>
  );
}
