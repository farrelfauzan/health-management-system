'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ConsultationPanelContent } from '#components/client/ai-assistant/consultation-panel-content';
import type { ConsultationPanelProps } from '#lib/ai-assistant/consultation-panel-props';

type ConsultationPanelDrawerProps = ConsultationPanelProps & {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * The consultation panel below `lg`, as an overlay. The panel used to be
 * `hidden … lg:flex`, which did not merely shrink it on tablet and phone — it
 * removed the suggested prompts and the entire history, leaving no way to
 * reach either.
 */
export function ConsultationPanelDrawer({
  isOpen,
  onOpenChange,
  ...panelProps
}: ConsultationPanelDrawerProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
        <SheetHeader className="border-b border-slate-200">
          <SheetTitle>{t('panelTitle')}</SheetTitle>
        </SheetHeader>
        <ConsultationPanelContent {...panelProps} />
      </SheetContent>
    </Sheet>
  );
}
