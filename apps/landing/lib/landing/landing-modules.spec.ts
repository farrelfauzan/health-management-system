import { describe, expect, it } from 'vitest';

import { LANDING_MODULES } from '#lib/landing/landing-modules';
import { MODULE_GROUPS } from '#lib/landing/module-groups';

const STEPS_PER_MODULE = 5;

describe('LANDING_MODULES', () => {
  it('gives every module a unique id', () => {
    const ids = LANDING_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every module five steps so the flow grid stays aligned', () => {
    const counts = LANDING_MODULES.map((module) => module.steps.length);
    expect(counts.every((count) => count === STEPS_PER_MODULE)).toBe(true);
  });

  it('only uses known module groups', () => {
    const unknown = LANDING_MODULES.filter((module) => !(module.groupId in MODULE_GROUPS));
    expect(unknown).toEqual([]);
  });
});
