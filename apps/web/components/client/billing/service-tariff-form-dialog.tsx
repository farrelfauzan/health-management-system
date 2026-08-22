'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SERVICE_TARIFF_CATEGORIES,
  type CreateServiceTariffInput,
  type ServiceTariffCategoryValue,
  type ServiceTariffResponse,
  type UpdateServiceTariffInput,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { RoomClassSelect } from '#components/client/rooms/room-class-select';
import {
  serviceTariffControllerCreateServiceTariffV1,
  serviceTariffControllerUpdateServiceTariffV1,
} from '#lib/api/generated/service-tariffs/service-tariffs';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';
import { formatStatusLabel } from '#lib/shared/status-label';

type ServiceTariffFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tariff: ServiceTariffResponse | null;
};

export function ServiceTariffFormDialog({
  open,
  onOpenChange,
  tariff,
}: ServiceTariffFormDialogProps) {
  const t = useTranslations('operations');
  const queryClient = useQueryClient();
  const isEditing = tariff !== null;
  const [code, setCode] = useState<string>(tariff?.code ?? '');
  const [name, setName] = useState<string>(tariff?.name ?? '');
  const [category, setCategory] = useState<ServiceTariffCategoryValue>(
    tariff?.category ?? 'CONSULTATION',
  );
  const [icd9cmCode, setIcd9cmCode] = useState<string>(tariff?.icd9cmCode ?? '');
  const [roomClassId, setRoomClassId] = useState<string>(tariff?.roomClassId ?? '');
  const [price, setPrice] = useState<string>(tariff ? String(tariff.price) : '');
  const [isActive, setIsActive] = useState<boolean>(tariff?.isActive ?? true);
  const [actionError, setActionError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: CreateServiceTariffInput | UpdateServiceTariffInput) =>
      isEditing
        ? serviceTariffControllerUpdateServiceTariffV1(
            tariff.id,
            payload as UpdateServiceTariffInput,
          )
        : serviceTariffControllerCreateServiceTariffV1(payload as CreateServiceTariffInput),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    const trimmedIcd9cm = icd9cmCode.trim();
    const parsedPrice = Number(price.trim());

    if (trimmedName.length === 0 || (!isEditing && trimmedCode.length === 0)) {
      setActionError('Code and name are both required.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setActionError('Enter the price in rupiah.');
      return;
    }

    // `code` is immutable — invoice items snapshot their provenance against it,
    // so an update never sends it.
    // An ACCOMMODATION tariff prices one ward class and every other category
    // prices none — the API's schema and the CHECK constraint behind it both
    // refuse the mismatch, so the form sends the class only where it belongs.
    const isAccommodation = category === 'ACCOMMODATION';

    if (isAccommodation && roomClassId.length === 0) {
      setActionError(t('billing.accommodationNeedsClass'));
      return;
    }

    const payload = isEditing
      ? ({
          name: trimmedName,
          category,
          icd9cmCode: trimmedIcd9cm.length > 0 ? trimmedIcd9cm : null,
          price: parsedPrice,
          isActive,
          ...(isAccommodation ? { roomClassId } : {}),
        } satisfies UpdateServiceTariffInput)
      : ({
          code: trimmedCode,
          name: trimmedName,
          category,
          price: parsedPrice,
          isActive,
          ...(trimmedIcd9cm.length > 0 ? { icd9cmCode: trimmedIcd9cm } : {}),
          ...(isAccommodation ? { roomClassId } : {}),
        } satisfies CreateServiceTariffInput);

    try {
      const response = await saveMutation.mutateAsync(payload);
      parseApiSuccess<ServiceTariffResponse>(response, t('billing.tariffSaveError'));
      await invalidateBillingQueries(queryClient);
      onOpenChange(false);
    } catch (error) {
      setActionError(notifyApiError(error, t('billing.tariffSaveError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {isEditing ? t('billing.editTariff') : t('billing.newTariff')}
            </DialogTitle>
            <DialogDescription>
              Tariffs price what the invoice generator collects from an encounter. A procedure
              without a matching tariff is reported as a gap and goes unbilled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {actionError ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {actionError}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="tariff-code"
                  className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
                >
                  Code
                </label>
                <Input
                  id="tariff-code"
                  value={code}
                  disabled={isEditing}
                  placeholder="e.g. CONS-GP"
                  onChange={(event) => setCode(event.target.value)}
                />
                {isEditing ? (
                  <p className="mt-1 text-xs text-slate-400">{t('billing.labels.immutableCode')}</p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor="tariff-price"
                  className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
                >
                  Price (Rp)
                </label>
                <Input
                  id="tariff-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="tariff-name"
                className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
              >
                Name
              </label>
              <Input
                id="tariff-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="tariff-category"
                  className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
                >
                  Category
                </label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as ServiceTariffCategoryValue)}
                >
                  <SelectTrigger id="tariff-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TARIFF_CATEGORIES.map((categoryValue) => (
                      <SelectItem key={categoryValue} value={categoryValue}>
                        {formatStatusLabel(categoryValue)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label
                  htmlFor="tariff-icd9cm"
                  className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
                >
                  ICD-9-CM Code
                </label>
                <Input
                  id="tariff-icd9cm"
                  placeholder={t('billing.labels.procedureLink')}
                  value={icd9cmCode}
                  onChange={(event) => setIcd9cmCode(event.target.value)}
                />
              </div>
            </div>
            {category === 'ACCOMMODATION' ? (
              <RoomClassSelect
                id="tariff-room-class"
                value={roomClassId}
                onChange={setRoomClassId}
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="bg-primary-container hover:bg-primary"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t('common.saving') : t('billing.saveTariff')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
