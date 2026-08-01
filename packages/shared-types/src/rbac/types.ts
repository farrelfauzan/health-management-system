export type ActorPermissionScope = 'ANY' | 'OWN';

export type ActorPermission = {
  action: string;
  resource: string;
  scope: ActorPermissionScope;
};

export type Actor = {
  /**
   * True for a reserved service account — an actor that exists so
   * machine-originated writes are attributable, never a person who signed in
   * (P14-T04's BPJS Antrean bridge is the first). Rules that only a machine
   * may take, and rules that only a human may take, both read this.
   */
  isSystem?: boolean;
  roles: Array<{
    role: {
      permissions: Array<{
        permission: ActorPermission;
      }>;
    };
  }>;
};

export type ActorScopeResolution = {
  hasAny: boolean;
  hasOwn: boolean;
};
