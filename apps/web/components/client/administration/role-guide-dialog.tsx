'use client';

import { ROLE_TEMPLATES } from '@hms/shared-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoleGuideTemplateCard } from '#components/client/administration/role-guide-template-card';
import { usePermissionCatalog } from '#lib/rbac/use-permission-catalog';

type RoleGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const RULE_KEYS = ['portal', 'dependencies', 'mfa', 'clinical', 'shells'] as const;

/**
 * "Panduan peran" (P22-T05): how a permission set behaves, and what each
 * template grants, for the clinic administrator composing roles. Generated
 * from `ROLE_TEMPLATES` and the live catalogue, so it cannot fall behind the
 * code the way a written SOP would.
 */
export function RoleGuideDialog({ open, onOpenChange }: RoleGuideDialogProps) {
  const t = useTranslations('operations.administration.roles.guide');
  const catalogQuery = usePermissionCatalog(open);
  const catalogByKey = new Map(
    catalogQuery.groups.flatMap((group) =>
      group.permissions.map((permission) => [permission.permissionKey, permission] as const),
    ),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <section>
            <h3 className="mb-2 font-heading text-sm font-semibold text-slate-800">
              {t('rulesTitle')}
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              {RULE_KEYS.map((key) => (
                <li key={key}>{t(`rules.${key}`)}</li>
              ))}
            </ul>
          </section>
          <section className="space-y-3">
            <h3 className="font-heading text-sm font-semibold text-slate-800">
              {t('templatesTitle')}
            </h3>
            {catalogQuery.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              ROLE_TEMPLATES.map((template) => (
                <RoleGuideTemplateCard
                  key={template.code}
                  template={template}
                  catalogByKey={catalogByKey}
                />
              ))
            )}
            <p className="text-sm text-slate-600">{t('midwife')}</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
