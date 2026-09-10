'use client';

import { Icon, cn } from '@hms/ui';
import type { ReactNode } from 'react';

import type { NoticeTone } from '#lib/shared/notice-tone';

type InlineNoticeProps = {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
};

type ToneStyle = {
  container: string;
  icon: string;
  iconName: string;
  emphasis: string;
  body: string;
};

/**
 * Same tokens as the dashboard badges (10% tint background, tone border).
 * `emphasis` is the statement style: bold in the tone colour for error and
 * warning, medium weight for success and info. `body` is the text below a
 * title; a statement without a title renders its whole message as emphasis.
 */
const TONE_STYLES: Record<NoticeTone, ToneStyle> = {
  error: {
    container: 'border-destructive/30 bg-destructive/10',
    icon: 'text-destructive',
    iconName: 'error',
    emphasis: 'font-semibold text-destructive',
    body: 'text-foreground',
  },
  warning: {
    container: 'border-warning/40 bg-warning-tint',
    icon: 'text-warning',
    iconName: 'warning',
    emphasis: 'font-semibold text-warning-emphasis',
    body: 'text-foreground',
  },
  success: {
    container: 'border-success/40 bg-success-tint',
    icon: 'text-success',
    iconName: 'check_circle',
    emphasis: 'font-medium text-success-emphasis',
    body: 'text-success-emphasis',
  },
  info: {
    container: 'border-info/30 bg-info-tint',
    icon: 'text-info',
    iconName: 'info',
    emphasis: 'font-medium text-info',
    body: 'text-info',
  },
};

const STATEMENT_TONES: ReadonlySet<NoticeTone> = new Set<NoticeTone>(['error', 'warning']);

/**
 * The one inline notice box for forms, dialogs and cards. Error and warning
 * notices announce (`role="alert"`) and render their title, or their whole
 * message when there is no title, bold in the tone colour so a refusal cannot
 * be mistaken for helper text. Success and info notices are polite `role="status"`.
 */
export function InlineNotice({
  tone,
  title,
  children,
  className,
  'data-testid': testId,
}: InlineNoticeProps) {
  const style = TONE_STYLES[tone];
  const isStatement = STATEMENT_TONES.has(tone);
  const hasTitle = title !== undefined && title.length > 0;
  const hasBody = children !== undefined && children !== null;
  return (
    <div
      role={isStatement ? 'alert' : 'status'}
      data-tone={tone}
      data-testid={testId}
      className={cn('flex gap-2.5 rounded-lg border px-3 py-2 text-sm', style.container, className)}
    >
      <Icon name={style.iconName} size={18} className={cn('mt-0.5', style.icon)} />
      <div className="min-w-0 flex-1 space-y-1">
        {hasTitle ? (
          <p data-slot="inline-notice-title" className={cn('font-heading', style.emphasis)}>
            {title}
          </p>
        ) : null}
        {hasBody ? (
          <div data-slot="inline-notice-body" className={hasTitle ? style.body : style.emphasis}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
