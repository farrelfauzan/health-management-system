import type { ModuleGroup } from '#lib/landing/module-group';
import type { ModuleGroupId } from '#lib/landing/module-group-id';

/** Module families keyed by id, in legend order. */
export const MODULE_GROUPS: Readonly<Record<ModuleGroupId, ModuleGroup>> = {
  service: { id: 'service', label: 'Pelayanan', color: '#0050CB' },
  finance: { id: 'finance', label: 'Keuangan & dokumen', color: '#006A61' },
  ai: { id: 'ai', label: 'AI & komunikasi', color: '#5B45F0' },
  integration: { id: 'integration', label: 'Integrasi & keamanan', color: '#0A6FA0' },
};
