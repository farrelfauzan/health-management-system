import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../../app.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The OpenAPI document must be buildable, because building it is part of
 * booting.
 *
 * `SwaggerModule.createDocument` reads every DTO's metadata factory, and a
 * `createZodDto` whose schema is malformed throws there — at startup, before
 * the app listens. Nothing else in the suite catches that: unit and
 * integration specs instantiate controllers without ever building the
 * document, `nest build` only type-checks, and the docker build never runs
 * the image. So a bad DTO used to reach a deployment and fail as a crash
 * loop.
 *
 * It is also the guard on the frontend contract: `apps/api/openapi.yaml` is
 * generated from this document, and a document that cannot be built is a
 * contract that cannot be regenerated.
 */
describe('OpenAPI document', () => {
  it('builds from the whole application', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();
    const app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api/v1');
    await app.init();

    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('HMS API').setVersion('1.0').addBearerAuth().build(),
      );

      expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(100);
    } finally {
      await app.close();
    }
  }, 60_000);
});
