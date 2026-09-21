'use client';

import type { FamilyPlanningCourseView } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FamilyPlanningServiceRow } from '#components/client/maternal-care/family-planning-service-row';

type FamilyPlanningCourseCardProps = {
  course: FamilyPlanningCourseView;
  onRecordService: () => void;
  onDiscontinue: () => void;
};

/** The live KB course (P25-T14): the method, when she is due, and each follow-up. */
export function FamilyPlanningCourseCard({
  course,
  onRecordService,
  onDiscontinue,
}: FamilyPlanningCourseCardProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="font-heading text-base">
          {t('maternalCare.familyPlanning.live')}
        </CardTitle>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRecordService}>
            <Icon name="add" size={16} />
            {t('maternalCare.familyPlanning.actions.recordService')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDiscontinue}>
            <Icon name="block" size={16} />
            {t('maternalCare.familyPlanning.actions.discontinue')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">{t('maternalCare.familyPlanning.fields.method')}</dt>
            <dd className="text-slate-900">
              {t(`maternalCare.familyPlanning.methods.${course.method}`)}
              {course.deliveryRecordId === null ? null : (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {t('maternalCare.familyPlanning.postDelivery')}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">
              {t('maternalCare.familyPlanning.fields.acceptorType')}
            </dt>
            <dd className="text-slate-900">
              {t(`maternalCare.familyPlanning.acceptorTypes.${course.acceptorType}`)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">
              {t('maternalCare.familyPlanning.fields.startedOn')}
            </dt>
            <dd className="text-slate-900">{course.startedOn}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">
              {t('maternalCare.familyPlanning.fields.nextDueOn')}
            </dt>
            <dd className="font-medium text-slate-900">
              {course.nextDueOn ?? t('maternalCare.familyPlanning.noDueDate')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">
              {t('maternalCare.familyPlanning.fields.provider')}
            </dt>
            <dd className="text-slate-900">{course.providerName}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">
              {t('maternalCare.familyPlanning.fields.sideEffects')}
            </dt>
            <dd className="text-slate-900">{course.sideEffects ?? '—'}</dd>
          </div>
        </dl>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500">
            {t('maternalCare.familyPlanning.services.title')}
          </h3>
          {course.services.length > 0 ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {course.services.map((service) => (
                <FamilyPlanningServiceRow key={service.id} service={service} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
              {t('maternalCare.familyPlanning.services.empty')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
