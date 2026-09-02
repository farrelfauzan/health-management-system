'use client';

import {
  PAGE_ORIENTATIONS,
  PAPER_SIZES,
  type PageOrientationValue,
  type PaperSizeValue,
  type TemplateSettingsValue,
} from '@hms/shared-types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

const MAX_MARGIN_MM = 50;

const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'] as const;

type MarginSide = (typeof MARGIN_SIDES)[number];

type TemplateSettingsFieldsProps = {
  value: TemplateSettingsValue;
  disabled: boolean;
  onChange: (next: TemplateSettingsValue) => void;
};

export function TemplateSettingsFields({ value, disabled, onChange }: TemplateSettingsFieldsProps) {
  const t = useTranslations('operations.billing.templates.settings');

  function handleMarginChange(side: MarginSide, raw: string): void {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(MAX_MARGIN_MM, Math.max(0, parsed));
    onChange({ ...value, marginMm: { ...value.marginMm, [side]: clamped } });
  }

  return (
    <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="space-y-1">
          <Label htmlFor="template-paper-size">{t('paperSize')}</Label>
          <Select
            value={value.paperSize}
            disabled={disabled}
            onValueChange={(paperSize: PaperSizeValue) => onChange({ ...value, paperSize })}
          >
            <SelectTrigger id="template-paper-size" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="template-orientation">{t('orientation')}</Label>
          <Select
            value={value.orientation}
            disabled={disabled}
            onValueChange={(orientation: PageOrientationValue) =>
              onChange({ ...value, orientation })
            }
          >
            <SelectTrigger id="template-orientation" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_ORIENTATIONS.map((orientation) => (
                <SelectItem key={orientation} value={orientation}>
                  {orientation === 'PORTRAIT' ? t('portrait') : t('landscape')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('margins')}</p>
          <div className="grid grid-cols-2 gap-2">
            {MARGIN_SIDES.map((side) => (
              <div key={side} className="space-y-1">
                <Label htmlFor={`template-margin-${side}`} className="text-xs text-slate-500">
                  {t(side)}
                </Label>
                <Input
                  id={`template-margin-${side}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_MARGIN_MM}
                  step={1}
                  value={value.marginMm[side]}
                  disabled={disabled}
                  onChange={(event) => handleMarginChange(side, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
