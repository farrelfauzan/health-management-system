'use client';

import type { DeliveryLinkResolutionView } from '@hms/shared-types';
import { Button, Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  deliveryLinkPublicControllerResolveLinkV1,
  getDeliveryLinkPublicControllerResolveLinkV1QueryKey,
} from '#lib/api/generated/invoice-delivery/invoice-delivery';
import { useApiQuery } from '#lib/api/use-api-query';
import { resolveDeliveryLinkMessageKey } from '#lib/document-delivery/resolve-delivery-link-message-key';

type DeliveryLinkCardProps = {
  token: string;
};

/**
 * The patient's landing page for a link delivery (P16-T25/T27, FR-E4-11),
 * reached from a chat or an email with no session of any kind.
 *
 * Resolving the token is the open: the API counts it and hands back a
 * presigned download that lives for minutes, so the page shows one button
 * rather than redirecting — a redirect the browser blocks leaves the patient
 * on a blank page with nothing to press. Every dead link reads the same
 * (§7.4.9); this page never says whether a bill exists.
 */
export function DeliveryLinkCard({ token }: DeliveryLinkCardProps) {
  const t = useTranslations('authShell.deliveryLink');
  const linkQuery = useApiQuery<DeliveryLinkResolutionView>({
    queryKey: getDeliveryLinkPublicControllerResolveLinkV1QueryKey(token),
    queryFn: (signal) => deliveryLinkPublicControllerResolveLinkV1(token, signal),
    errorMessage: t('invalidLink'),
    options: { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false },
  });

  if (linkQuery.isPending) {
    return (
      <Card className="border-slate-200 shadow-none">
        <CardContent className="p-6 text-sm text-slate-600">{t('checking')}</CardContent>
      </Card>
    );
  }

  if (linkQuery.isError || !linkQuery.data) {
    const messageKey = resolveDeliveryLinkMessageKey(linkQuery.error) ?? 'invalidLink';
    return (
      <Card className="border-slate-200 shadow-none">
        <CardContent className="space-y-3 p-6">
          <h1 className="font-heading text-lg text-slate-900">{t('invalidTitle')}</h1>
          <p role="alert" className="text-sm text-slate-600">
            {t(messageKey)}
          </p>
          <p className="text-sm text-slate-600">{t('invalidHelp')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="space-y-4 p-6">
        <h1 className="font-heading text-lg text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-600">{t('ready')}</p>
        <Button asChild className="bg-primary-container hover:bg-primary">
          <a href={linkQuery.data.url} target="_blank" rel="noopener noreferrer">
            <Icon name="download" size={18} />
            {t('download', { fileName: linkQuery.data.fileName })}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
