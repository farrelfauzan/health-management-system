import { Badge, Card, CardContent, Icon } from '@hms/ui';
import { getTranslations } from 'next-intl/server';

export async function ActiveAlertCard() {
  const t = await getTranslations('clinical');
  return (
    <Card className="rounded-xl border-slate-200 shadow-none md:col-span-2">
      <CardContent className="flex items-center justify-between gap-6 p-6">
        <div className="space-y-2">
          <Badge className="rounded-full bg-secondary/10 text-[10px] font-bold uppercase tracking-widest text-secondary">
            {t('patients.activeAlert')} ({t('patients.sample')})
          </Badge>
          <h3 className="font-heading text-xl font-semibold text-slate-900">
            {t('patients.alertHeadline')}
          </h3>
          <p className="text-sm text-slate-500">{t('patients.alertRecommendation')}</p>
        </div>
        <div className="hidden size-24 shrink-0 items-center justify-center rounded-full border-4 border-secondary/10 bg-secondary/5 sm:flex">
          <Icon name="warning" size={40} className="text-secondary" />
        </div>
      </CardContent>
    </Card>
  );
}
