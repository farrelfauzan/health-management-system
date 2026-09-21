'use client';

type NewbornCareFactProps = {
  label: string;
  value: string | null;
};

/**
 * One measurement of a newborn's first hour, with a dash where nothing was
 * recorded (P25-T09).
 *
 * A dash rather than a blank cell on purpose: "not recorded" and "nothing to
 * record" look identical when the cell is empty, and a checklist is read for
 * what is missing.
 */
export function NewbornCareFact({ label, value }: NewbornCareFactProps) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
