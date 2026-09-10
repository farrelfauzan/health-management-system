'use client';

import { useTranslations } from 'next-intl';
import { cn, Icon, useSidebar } from '@hms/ui';

/**
 * The collapse/expand control that lives on the brand row (P19-T01).
 *
 * Expanded, it sits at the right edge of the row and shows on hover or focus;
 * collapsed, it covers the mark itself so hovering the logo is what reveals
 * it. It is a real button with a label in both states, so a keyboard user
 * reaches it by tabbing to the row. Mobile has no collapsed state — the
 * sheet is opened from the top bar — so nothing renders there.
 */
export function SidebarBrandToggle() {
  const { isMobile, state, toggleSidebar } = useSidebar();
  const t = useTranslations('authShell.shell.sidebar');
  if (isMobile) {
    return null;
  }
  const isCollapsed = state === 'collapsed';
  const label = isCollapsed ? t('expand') : t('collapse');
  return (
    <button
      type="button"
      data-slot="sidebar-brand-toggle"
      data-state={state}
      aria-label={label}
      aria-expanded={!isCollapsed}
      title={label}
      onClick={toggleSidebar}
      className={cn(
        'absolute z-10 flex items-center justify-center rounded-md text-sidebar-foreground opacity-0 ring-sidebar-ring outline-hidden transition-opacity duration-150',
        'group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100 focus-visible:opacity-100 focus-visible:ring-2',
        isCollapsed
          ? 'inset-0 bg-sidebar/90'
          : 'top-1/2 right-1 size-8 -translate-y-1/2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon name={isCollapsed ? 'chevron_right' : 'chevron_left'} size={22} />
    </button>
  );
}
