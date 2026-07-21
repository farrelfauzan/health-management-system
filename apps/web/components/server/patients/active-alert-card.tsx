import { Badge, Card, CardContent, Icon } from '@hms/ui';

import { MOCK_ACTIVE_ALERT } from '#lib/patients/mock-active-alert';

export function ActiveAlertCard() {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none md:col-span-2">
      <CardContent className="flex items-center justify-between gap-6 p-6">
        <div className="space-y-2">
          <Badge className="rounded-full bg-secondary/10 text-[10px] font-bold uppercase tracking-widest text-secondary">
            {MOCK_ACTIVE_ALERT.badge} (sample)
          </Badge>
          <h3 className="font-heading text-xl font-semibold text-slate-900">
            {MOCK_ACTIVE_ALERT.headline}
          </h3>
          <p className="text-sm text-slate-500">{MOCK_ACTIVE_ALERT.recommendation}</p>
        </div>
        <div className="hidden size-24 shrink-0 items-center justify-center rounded-full border-4 border-secondary/10 bg-secondary/5 sm:flex">
          <Icon name="warning" size={40} className="text-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
