import { createMongoAbility, ForbiddenError } from '@casl/ability';
import { ForbiddenException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthRepository } from '../../modules/auth/repository/auth.repository';
import { AbilityFactory } from './ability.factory';
import { PERMISSION_CHECKER_KEY } from './check-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const authRepository = {
    findUserById: jest.fn(),
  } as unknown as AuthRepository;

  const abilityFactory = {
    createForPermissions: jest.fn(),
  } as unknown as AbilityFactory;

  const guard = new PermissionsGuard(reflector, authRepository, abilityFactory);

  const createContext = (user?: { sub: string; email: string }) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return true;
      return undefined;
    });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('denies routes without permission metadata that are not public', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return undefined;
      if (key === PERMISSION_CHECKER_KEY) return undefined;
      return undefined;
    });

    await expect(guard.canActivate(createContext({ sub: 'u1', email: 'a@a.com' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authRepository.findUserById).not.toHaveBeenCalled();
  });

  it('denies routes whose permission metadata is an empty list', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PERMISSION_CHECKER_KEY) return [];
      return undefined;
    });

    await expect(guard.canActivate(createContext({ sub: 'u1', email: 'a@a.com' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authRepository.findUserById).not.toHaveBeenCalled();
  });

  it('throws unauthorized when user is missing', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PERMISSION_CHECKER_KEY) return [{ action: 'read', subject: 'Role' }];
      return undefined;
    });

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws forbidden when permission check fails', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PERMISSION_CHECKER_KEY) return [{ action: 'read', subject: 'Role' }];
      return undefined;
    });

    (authRepository.findUserById as jest.Mock).mockResolvedValue({
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'User',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    (abilityFactory.createForPermissions as jest.Mock).mockReturnValue(
      createMongoAbility([{ action: 'read', subject: 'User' }]),
    );

    await expect(guard.canActivate(createContext({ sub: 'u1', email: 'a@a.com' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws internal error on unexpected ability exceptions', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PERMISSION_CHECKER_KEY) return [{ action: 'read', subject: 'Role' }];
      return undefined;
    });

    (authRepository.findUserById as jest.Mock).mockResolvedValue({
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'Role',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    (abilityFactory.createForPermissions as jest.Mock).mockReturnValue({
      can: jest.fn(() => {
        throw new Error('boom');
      }),
    });

    const throwUnlessCanSpy = jest
      .spyOn(ForbiddenError, 'from')
      .mockImplementation(() => ({
        setMessage: () => ({
          throwUnlessCan: () => {
            throw new Error('boom');
          },
        }),
      }) as any);

    await expect(guard.canActivate(createContext({ sub: 'u1', email: 'a@a.com' }))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    throwUnlessCanSpy.mockRestore();
  });

  it('allows access when permission check passes', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PERMISSION_CHECKER_KEY) return [{ action: 'read', subject: 'Role' }];
      return undefined;
    });

    (authRepository.findUserById as jest.Mock).mockResolvedValue({
      roles: [
        {
          role: {
            code: 'ADMIN',
            permissions: [
              {
                permission: {
                  action: 'read',
                  resource: 'Role',
                  scope: 'ANY',
                },
              },
            ],
          },
        },
      ],
    });

    (abilityFactory.createForPermissions as jest.Mock).mockReturnValue(
      createMongoAbility([{ action: 'read', subject: 'Role' }]),
    );

    await expect(guard.canActivate(createContext({ sub: 'u1', email: 'a@a.com' }))).resolves.toBe(true);
  });
});
