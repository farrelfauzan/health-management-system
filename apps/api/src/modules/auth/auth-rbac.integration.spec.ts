import { INestApplication, UnauthorizedException, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RbacService } from '../rbac/service/rbac.service';
import { AuthRepository } from '../auth/repository/auth.repository';
import { JwtService } from '@nestjs/jwt';

describe('Auth + RBAC integration', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(),
  };

  const rbacServiceMock = {
    getRoles: jest.fn().mockResolvedValue([
      {
        id: 'role-admin',
        code: 'ADMIN',
        name: 'Admin',
      },
    ]),
    assignRole: jest.fn(),
    unassignRole: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(RbacService)
      .useValue(rbacServiceMock)
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({
      defaultVersion: '1',
      prefix: 'v',
      type: VersioningType.URI,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no bearer token is provided', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/v1/rbac/roles');

    expect(response.status).toBe(401);
  });

  it('returns 403 when authenticated user lacks required permission', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: 'user-no-role-read',
        email: 'user@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'user-no-role-read',
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

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/rbac/roles')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
  });

  it('returns 200 when authenticated user has required permission', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: 'admin-user',
        email: 'admin@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue({
      id: 'admin-user',
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

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/rbac/roles')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('returns 401 when token user no longer exists', async () => {
    const accessToken = await jwtService.signAsync(
      {
        sub: 'deleted-user',
        email: 'deleted@hms.local',
      },
      {
        secret: 'dev-access-secret',
      },
    );

    authRepositoryMock.findUserById.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .get('/api/v1/v1/rbac/roles')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(new UnauthorizedException('User not found').message);
  });
});
