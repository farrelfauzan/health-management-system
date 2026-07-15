'use client';

import type { ReactNode } from 'react';

import type { AppAction, AppSubject } from './ability';
import { useAbility } from './ability-provider';

type CanProps = {
  action: AppAction;
  subject: AppSubject;
  children: ReactNode;
  fallback?: ReactNode;
};

export function Can({ action, subject, children, fallback = null }: CanProps) {
  const ability = useAbility();

  if (!ability.can(action, subject)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
