import Image from 'next/image';

import { FACILITY_CONFIG } from '#lib/facility/facility-config';

/**
 * The branded half of the login screen. Deliberately light: the lockup's
 * wordmark is dark navy and teal, so a dark panel would swallow it.
 */
export function LoginVisualPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-surface lg:flex lg:items-center lg:justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-surface-container-high blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-secondary-container/40 blur-3xl"
      />
      <div className="relative flex w-full max-w-lg flex-col items-center gap-8 px-12">
        <Image
          src="/saling-jaga-lockup.png"
          alt={`${FACILITY_CONFIG.name} — Health Management System`}
          width={1100}
          height={1021}
          priority
          sizes="(min-width: 1024px) 32rem, 0px"
          className="h-auto w-full max-w-md object-contain"
        />
        <p className="max-w-sm text-center text-sm leading-relaxed text-on-surface-variant">
          One record per visit — registration, encounter, pharmacy, and billing, with BPJS and
          SATUSEHAT reporting handled in the background.
        </p>
      </div>
    </section>
  );
}
