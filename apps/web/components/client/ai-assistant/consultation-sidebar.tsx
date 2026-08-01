'use client';

import { Button, Icon, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ConsultationPanelContent } from '#components/client/ai-assistant/consultation-panel-content';
import { ConsultationPanelRail } from '#components/client/ai-assistant/consultation-panel-rail';
import type { ConsultationPanelProps } from '#lib/ai-assistant/consultation-panel-props';

type ConsultationSidebarProps = ConsultationPanelProps & {
  isCollapsed: boolean;
  onToggleCollapsed: (isCollapsed: boolean) => void;
};

/**
 * The desktop consultation column. Below `lg` it is absent here on purpose —
 * `ConsultationPanelDrawer` takes over at that size, so the prompts and
 * history stay reachable on a tablet instead of disappearing as they used to.
 */
export function ConsultationSidebar({
  isCollapsed,
  onToggleCollapsed,
  ...panelProps
}: ConsultationSidebarProps) {
  const t = useTranslations('aiAssistant.sidebar');
  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex',
        isCollapsed ? 'w-14' : 'w-80',
      )}
    >
      {isCollapsed ? (
        <ConsultationPanelRail
          onNewConsultation={panelProps.onNewConsultation}
          onExpand={() => onToggleCollapsed(false)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-slate-200 px-2 py-1">
            <span className="pl-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {t('panelTitle')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onToggleCollapsed(true)}
              aria-label={t('collapsePanel')}
              title={t('collapsePanel')}
            >
              <Icon name="left_panel_close" size={20} className="text-current" />
            </Button>
          </div>
          <ConsultationPanelContent {...panelProps} />
        </>
      )}
    </aside>
  );
}
