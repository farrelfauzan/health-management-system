export type ActorPermissionScope = 'ANY' | 'OWN';

export type ActorPermission = {
  action: string;
  resource: string;
  scope: ActorPermissionScope;
};

export type Actor = {
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
