'use client';

import type { EncounterRelatedPrescription } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@hms/ui';

import { StatusBadge } from '#components/shared/status-badge';
import { formatRegisteredAt } from '#lib/registrations/format-registered-at';

type EncounterPrescriptionsCardProps = {
  prescriptions: EncounterRelatedPrescription[];
};

export function EncounterPrescriptionsCard({ prescriptions }: EncounterPrescriptionsCardProps) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-base">Prescriptions</CardTitle>
      </CardHeader>
      <CardContent>
        {prescriptions.length > 0 ? (
          <ul className="space-y-2">
            {prescriptions.map((prescription) => (
              <li
                key={prescription.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-700">
                    {prescription.itemCount} item{prescription.itemCount === 1 ? '' : 's'}
                  </p>
                  {prescription.issuedAt ? (
                    <p className="text-xs text-slate-500">
                      Issued {formatRegisteredAt(prescription.issuedAt)}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={prescription.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No prescription written during this visit. The pharmacy queue is where dispensing
            happens.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
