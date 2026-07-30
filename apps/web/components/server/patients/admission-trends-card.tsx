import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { getTranslations } from 'next-intl/server';

import { MOCK_ADMISSION_TRENDS } from '#lib/patients/mock-admission-trends';

const CHART_WIDTH = 240;
const CHART_HEIGHT = 64;
const BAR_GAP = 6;
const MAX_TREND_VALUE = 100;

export async function AdmissionTrendsCard() {
  const t = await getTranslations('clinical');
  const barWidth =
    (CHART_WIDTH - BAR_GAP * (MOCK_ADMISSION_TRENDS.length - 1)) / MOCK_ADMISSION_TRENDS.length;

  return (
    <Card className="rounded-xl border-primary/10 bg-info-tint/40 shadow-none">
      <CardHeader>
        <Icon name="analytics" size={22} className="text-primary" />
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('patients.admissionTrends')}
        </CardTitle>
        <p className="text-xs text-slate-500">
          {t('patients.admissionSummary')} ({t('patients.sampleData')})
        </p>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label={t('patients.admissionChartLabel')}
          className="h-16 w-full"
        >
          {MOCK_ADMISSION_TRENDS.map((point, index) => {
            const barHeight = (point.value / MAX_TREND_VALUE) * CHART_HEIGHT;
            return (
              <rect
                key={point.label}
                x={index * (barWidth + BAR_GAP)}
                y={CHART_HEIGHT - barHeight}
                width={barWidth}
                height={barHeight}
                rx={2}
                className="fill-primary/40"
              />
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
