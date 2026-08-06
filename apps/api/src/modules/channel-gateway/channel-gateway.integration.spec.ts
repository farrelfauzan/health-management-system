import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboundMessageSink } from './service/inbound-message-sink.service';

/**
 * `PCS-T05` acceptance over HTTP, against real Postgres.
 *
 * Three properties live here and nowhere else. **The secret-token check is
 * the only thing in front of a public endpoint**, so it is asserted through
 * the real guard pipeline rather than by calling `canActivate` directly — a
 * guard that works in isolation but is not actually mounted is the failure
 * shape that matters. **Dedup is a unique index**, and a mocked Prisma would
 * accept two identical inserts happily; only the database refuses the second.
 * And **every authenticated delivery answers 200**, including the ones this
 * clinic cannot use, because Telegram redelivers anything else on a schedule
 * until it drops the webhook entirely.
 *
 * Runs against `DATABASE_URL`.
 */
describe('Channel gateway integration', () => {
  const WEBHOOK_SECRET = 'integration-test-webhook-secret';
  const WEBHOOK_PATH = '/api/v1/channels/telegram/webhook';
  const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';
  const TEST_ENV: Record<string, string> = {
    CS_CHANNEL_ENABLED: 'true',
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TELEGRAM_BOT_TOKEN: 'integration-test-token',
  };

  let app: INestApplication;
  let prisma: PrismaService;
  const previousEnv: Record<string, string | undefined> = {};
  const sinkMock = { handleInboundMessage: jest.fn().mockResolvedValue(undefined) };
  /** Chat ids are per-run so a re-run cannot collide with its own leftovers. */
  let chatId: number;

  function buildUpdate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      update_id: 1,
      message: {
        message_id: 100,
        date: 1_786_006_800,
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, is_bot: false, first_name: 'Siti' },
        text: 'Klinik buka jam berapa?',
        ...overrides,
      },
    };
  }

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InboundMessageSink)
      .useValue(sinkMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(() => {
    // A positive id well outside Telegram's real range, unique per test.
    chatId = Math.floor(Math.random() * 1_000_000) + 900_000_000;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await prisma.channelInboundReceipt.deleteMany({
      where: { externalChatId: String(chatId) },
    });
  });

  afterAll(async () => {
    await app.close();
    // `app.close()` tears down the module graph but leaves the pool open
    // unless shutdown hooks are enabled, and a held connection makes Jest
    // hang after the run rather than fail it — the more confusing of the two.
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('accepts a delivery carrying the configured secret and records a receipt', async () => {
    const response = await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, WEBHOOK_SECRET)
      .send(buildUpdate());

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('ACCEPTED');
    expect(sinkMock.handleInboundMessage).toHaveBeenCalledTimes(1);
    const receipts = await prisma.channelInboundReceipt.findMany({
      where: { externalChatId: String(chatId) },
    });
    expect(receipts).toHaveLength(1);
  });

  it('drops a redelivered message at the database rather than handling it twice', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post(WEBHOOK_PATH)
        .set(SECRET_HEADER, WEBHOOK_SECRET)
        .send(buildUpdate());

    const first = await send();
    const second = await send();

    // The property the whole table exists for: a retried booking message must
    // not book twice. Only the unique index can prove this — a mocked Prisma
    // would accept both inserts.
    expect(first.body.data.outcome).toBe('ACCEPTED');
    expect(second.body.data.outcome).toBe('DUPLICATE');
    expect(sinkMock.handleInboundMessage).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
  });

  it('treats the same message id in a different chat as a new message', async () => {
    await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, WEBHOOK_SECRET)
      .send(buildUpdate());
    const otherChatId = chatId + 1;

    const response = await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, WEBHOOK_SECRET)
      .send({
        update_id: 2,
        message: {
          message_id: 100,
          date: 1_786_006_800,
          chat: { id: otherChatId, type: 'private' },
          from: { id: otherChatId, is_bot: false, first_name: 'Budi' },
          text: 'Halo',
        },
      });

    // Telegram numbers messages per chat, so message_id 100 recurs across
    // customers. A two-column key would drop this second customer's message
    // as a duplicate of the first's — which is why the constraint carries the
    // chat id too.
    expect(response.body.data.outcome).toBe('ACCEPTED');
    await prisma.channelInboundReceipt.deleteMany({
      where: { externalChatId: String(otherChatId) },
    });
  });

  it('refuses a delivery with the wrong secret', async () => {
    const response = await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, 'wrong-secret-entirely')
      .send(buildUpdate());

    expect(response.status).toBe(401);
    expect(sinkMock.handleInboundMessage).not.toHaveBeenCalled();
  });

  it('refuses a delivery with no secret header at all', async () => {
    const response = await request(app.getHttpServer()).post(WEBHOOK_PATH).send(buildUpdate());

    // The endpoint is @PublicRoute for JWT purposes, so a missing header must
    // not fall through to an unauthenticated success.
    expect(response.status).toBe(401);
  });

  it('acknowledges an update it cannot use instead of making Telegram retry it', async () => {
    const response = await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, WEBHOOK_SECRET)
      .send({
        update_id: 3,
        message: {
          message_id: 101,
          date: 1_786_006_800,
          chat: { id: chatId, type: 'private' },
          from: { id: chatId, is_bot: false },
          // A sticker: no text field at all.
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('IGNORED');
    const receipts = await prisma.channelInboundReceipt.findMany({
      where: { externalChatId: String(chatId) },
    });
    // An ignored update claims nothing — otherwise a later real message
    // reusing that id would be dropped as a duplicate.
    expect(receipts).toHaveLength(0);
  });

  it('never lets a group chat reach the handler', async () => {
    const response = await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set(SECRET_HEADER, WEBHOOK_SECRET)
      .send(buildUpdate({ chat: { id: chatId, type: 'group' } }));

    expect(response.body.data.outcome).toBe('IGNORED');
    expect(sinkMock.handleInboundMessage).not.toHaveBeenCalled();
  });
});
