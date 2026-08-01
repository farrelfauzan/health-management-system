'use client';

import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

type ConsultationPanelRailProps = {
  onNewConsultation: () => void;
  onExpand: () => void;
};

/**
 * The collapsed sidebar. A rail rather than zero width on purpose: collapsing
 * should reclaim reading space, not hide the way back — "new consultation"
 * stays one click away and the expand control is where the panel used to be.
 */
export function ConsultationPanelRail({ onNewConsultation, onExpand }: ConsultationPanelRailProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onExpand}
        aria-label={t('expandPanel')}
        title={t('expandPanel')}
      >
        <Icon name="right_panel_open" size={20} className="text-current" />
      </Button>
      <Button
        type="button"
        size="icon"
        onClick={onNewConsultation}
        aria-label={t('newConsultation')}
        title={t('newConsultation')}
      >
        <Icon name="add" size={20} className="text-current" />
      </Button>
    </div>
  );
}
