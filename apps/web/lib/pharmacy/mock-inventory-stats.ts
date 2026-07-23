// DUMMY-DATA: the MVP medication contract (GET /api/v1/medications) exposes only stockQty —
// no unit price and no expiry date — so inventory value and expiring-soon stats cannot be
// computed from real data. Replace once the medication schema gains price/expiry fields
// (post-MVP contract extension) and the API exposes aggregate inventory stats.
export type PharmacyInventoryStats = {
  totalInventoryValue: string;
  inventoryTrend: string;
  expiringSoonCount: number;
  lastAuditLabel: string;
};

export const MOCK_INVENTORY_STATS: PharmacyInventoryStats = {
  totalInventoryValue: '$142,500.00',
  inventoryTrend: '+12% vs last week',
  expiringSoonCount: 24,
  lastAuditLabel: 'Last audit: 2h ago',
};
