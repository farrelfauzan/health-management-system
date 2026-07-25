'use client';

export function ConfidentialDisclaimer() {
  return (
    <p className="mx-auto mt-3 max-w-2xl text-center text-[11px] leading-tight text-slate-500">
      <span className="font-bold text-rose-600">CONFIDENTIAL PATIENT DATA:</span> This assistant is
      a preview running on simulated data. All clinical decisions must be reviewed and signed off
      by a licensed practitioner. AI can hallucinate; always verify against original lab sources.
    </p>
  );
}
