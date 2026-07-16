'use client';

import { createContext, useContext } from 'react';

import { buildAppAbility, type AppAbility } from './ability';

const AbilityContext = createContext<AppAbility>(buildAppAbility([]));

type AbilityProviderProps = {
  ability: AppAbility;
  children: React.ReactNode;
};

export function AbilityProvider({ ability, children }: AbilityProviderProps) {
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

export function useAbility() {
  return useContext(AbilityContext);
}
