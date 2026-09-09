/**
 * One administrative region as the API returns it (P19-T10). The level is
 * implied by the route that returned it and by the code's shape; `parentCode`
 * is present on every level below province so a client can rebuild the chain
 * from a village alone.
 */
export type Region = {
  code: string;
  name: string;
  parentCode?: string;
};

export type RegionsListMeta = {
  page: number;
  limit: number;
  total: number;
};
