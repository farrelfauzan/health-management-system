'use client';

import { AbilityProvider, buildAppAbility, type AppRule } from '@hms/ui';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

type AppAbilityProviderProps = {
  rules: AppRule[];
  children: ReactNode;
};

export function AppAbilityProvider({ rules, children }: AppAbilityProviderProps) {
  const ability = useMemo(() => buildAppAbility(rules), [rules]);

  return <AbilityProvider ability={ability}>{children}</AbilityProvider>;
}
