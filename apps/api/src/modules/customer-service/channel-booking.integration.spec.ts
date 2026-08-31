import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { MrnAllocatorRepository } from '../../common/mrn/mrn-allocator.repository';
import { PrivacyNoticeRepository } from '../../common/privacy-notice/privacy-notice.repository';
import { PatientManagementRepository } from '../patient-management/repository/patient-management.repository';
import { ChannelOtpChallengeRepository } from './repository/channel-otp-challenge.repository';
import { ProspectivePatientRepository } from './repository/prospective-patient.repository';
import { normalizePhoneNumber } from './service/normalize-phone-number';

/**
 * The `PCS-T07` guarantees that live in SQL rather than in TypeScript, and so
 * cannot be proven by any unit test.
 *
 * The phone match is the one that earns this file. Its comparison is written
 * **twice** — once as `normalizePhoneNumber` and once as a `regexp_replace`
 * pair inside the lookup query — because the registry column holds whatever
 * the front desk typed and there is no way to normalise it without loading the
 * table. Two implementations of one rule is exactly the drift a unit test
 * cannot see: mocking the repository proves the TypeScript half against
 * itself. This ran the two against each other and immediately found that `\D`
 * inside a template literal collapses to a bare `D`, which would have stripped
 * the letter D from phone numbers, matched nothing, and quietly created a
 * second patient record for every returning customer.
 *
 * The OTP hash is the other: it is written by one method and compared by a
 * `where` clause, and the point of that arrangement is that the hash never
 * exists as a value anywhere in between — which is only checkable by writing
 * one and asking the database.
 *
 * Rows are namespaced by a fixed marker and removed around each run so a
 * shared dev database is never left with test residue.
 */
describe('customer-service channel booking against Postgres', () => {
  const TEST_MARKER = 'pcs-t07-spec';

  let prisma: PrismaService;
  let patientRepository: PatientManagementRepository;
  let challengeRepository: ChannelOtpChallengeRepository;
  let prospectiveRepository: ProspectivePatientRepository;
  let createdPatientIds: string[] = [];

  async function createPatient(phoneNumber: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${createdPatientIds.length}`,
        fullName: `${TEST_MARKER} patient`,
        dateOfBirth: new Date('1990-05-12T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber,
        address: 'Jakarta',
      },
      select: { id: true },
    });
    createdPatientIds.push(patient.id);
    return patient.id;
  }

  async function deleteTestRows(): Promise<void> {
    await prisma.channelOtpChallenge.deleteMany({
      where: { patientFullName: { startsWith: TEST_MARKER } },
    });
    await prisma.conversation.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    await prisma.channelPatientLink.deleteMany({
      where: { externalChatId: { startsWith: TEST_MARKER } },
    });
    await prisma.prospectivePatient.deleteMany({
      where: { fullName: { startsWith: TEST_MARKER } },
    });
    await prisma.patientProfile.deleteMany({ where: { mrn: { startsWith: TEST_MARKER } } });
    createdPatientIds = [];
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const identifierCrypto = new NationalIdentifierCryptoService(new ConfigService());
    patientRepository = new PatientManagementRepository(
      prisma,
      identifierCrypto,
      new MrnAllocatorRepository(new ConfigService()),
      new PrivacyNoticeRepository(prisma),
    );
    challengeRepository = new ChannelOtpChallengeRepository(prisma, identifierCrypto);
    prospectiveRepository = new ProspectivePatientRepository(prisma);
    await deleteTestRows();
  });

  afterAll(async () => {
    await deleteTestRows();
    await prisma.$disconnect();
  });

  describe('the phone match', () => {
    it.each([
      ['a national number', '081210000001'],
      ['an international number', '+62-812-1000-0001'],
      ['a country code without a plus', '62812 1000 0001'],
      ['a number in brackets', '(0812) 1000-0001'],
    ])('finds a record stored as %s', async (_label, storedPhoneNumber) => {
      const patientId = await createPatient(storedPhoneNumber);

      // The customer types it one way; the front desk typed it another. Both
      // halves of the comparison have to agree, and this is the only place
      // they meet.
      const matches = await patientRepository.findActivePatientsByNormalisedPhoneNumber(
        normalizePhoneNumber('+62 812 1000 0001'),
      );

      expect(matches.map((match) => match.id)).toContain(patientId);
    });

    it('does not match a different number', async () => {
      await createPatient('081210000001');

      const matches = await patientRepository.findActivePatientsByNormalisedPhoneNumber(
        normalizePhoneNumber('0899-0000-0000'),
      );

      expect(matches.map((match) => match.id)).toEqual([]);
    });

    it('reports the record source, so a draft is told apart from a registry record', async () => {
      const patientId = await createPatient('081299990001');
      await prisma.patientProfile.update({
        where: { id: patientId },
        // Source alone, since `P17-T05`: the demographics columns are NOT NULL,
        // and this test is about provenance rather than completeness anyway.
        data: { source: 'CHANNEL_BOOKING' },
      });

      const matches = await patientRepository.findActivePatientsByNormalisedPhoneNumber(
        normalizePhoneNumber('081299990001'),
      );

      // The nulls are the draft's whole point (§5.3), and the column has to
      // actually accept them.
      expect(matches).toContainEqual(
        expect.objectContaining({ id: patientId, source: 'CHANNEL_BOOKING' }),
      );
    });

    it('ignores a soft-deleted record', async () => {
      const patientId = await createPatient('081277770001');
      await prisma.patientProfile.update({
        where: { id: patientId },
        data: { deletedAt: new Date() },
      });

      const matches = await patientRepository.findActivePatientsByNormalisedPhoneNumber(
        normalizePhoneNumber('081277770001'),
      );

      expect(matches.map((match) => match.id)).toEqual([]);
    });
  });

  /**
   * `P17-T03`'s whole claim, checked where it is actually true: in the tables.
   *
   * A chat booking used to create a `PatientProfile`, which spent an MRN from
   * `MrnCounter` — an atomic `INSERT … ON CONFLICT … RETURNING` that never
   * reuses a number — on anyone who typed a name into WhatsApp. The unit tests
   * prove the service calls a different repository; only the database can prove
   * that the counter did not move.
   */
  describe('a chat booking spends no medical record number', () => {
    async function readMrnCounters(): Promise<Record<string, string>> {
      const rows = await prisma.mrnCounter.findMany({
        select: { facilityId: true, nextValue: true },
      });
      return Object.fromEntries(rows.map((row) => [row.facilityId, row.nextValue.toString()]));
    }

    it('creates no patient profile and does not advance the MRN counter', async () => {
      const countersBefore = await readMrnCounters();
      const profilesBefore = await prisma.patientProfile.count();

      const created = await prospectiveRepository.createAwaitingArrival({
        fullName: `${TEST_MARKER} prospective`,
        phoneNumber: normalizePhoneNumber('0812-9000-0001'),
        channel: 'WHATSAPP',
        externalChatId: `${TEST_MARKER}-chat-1`,
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      });

      expect(created.status).toBe('AWAITING_ARRIVAL');
      expect(created.patientId).toBeNull();
      expect(await prisma.patientProfile.count()).toBe(profilesBefore);
      expect(await readMrnCounters()).toEqual(countersBefore);
    });

    it('offers only unresolved records back to the next booking', async () => {
      const phoneNumber = normalizePhoneNumber('0812-9000-0002');
      const stillWaiting = await prospectiveRepository.createAwaitingArrival({
        fullName: `${TEST_MARKER} waiting`,
        phoneNumber,
        channel: 'WHATSAPP',
        externalChatId: `${TEST_MARKER}-chat-2`,
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      });
      const alreadyArrived = await prospectiveRepository.createAwaitingArrival({
        fullName: `${TEST_MARKER} arrived`,
        phoneNumber,
        channel: 'WHATSAPP',
        externalChatId: `${TEST_MARKER}-chat-2`,
        expiresAt: new Date(Date.now() + 90 * 86_400_000),
      });
      const patientId = await createPatient('081290000002');
      await prospectiveRepository.markConverted({
        prospectivePatientId: alreadyArrived.id,
        patientId,
        convertedById: patientId,
        convertedAt: new Date(),
      });

      const awaiting = await prospectiveRepository.findAwaitingArrivalByPhoneNumber(phoneNumber);

      // A number whose earlier booking already converted must not drag the
      // resolved record back into a new booking — that person is a patient now,
      // and reusing their prospective row would file the new appointment under
      // somebody the clinic has already registered.
      expect(awaiting.map((record) => record.id)).toEqual([stillWaiting.id]);
    });
  });

  describe('the possession challenge', () => {
    /**
     * A conversation per challenge, because `findLiveChallenge` answers "the
     * newest unconsumed one for this chat" and a shared conversation would let
     * one case's leftovers decide another's result. In production the state
     * machine already guarantees one at a time: the chat sits in
     * `AWAITING_OTP` while a challenge lives, and `book_appointment` cannot be
     * reached from there.
     */
    async function createConversation(): Promise<string> {
      const conversation = await prisma.conversation.create({
        data: {
          channel: 'TELEGRAM',
          externalChatId: `${TEST_MARKER}-chat-${createdPatientIds.length}-${Date.now()}`,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
      return conversation.id;
    }

    async function createChallenge(
      code: string | null,
      conversationId?: string,
    ): Promise<string> {
      const patientId = await createPatient(`0812${Date.now() % 100_000_000}`);
      const challenge = await challengeRepository.createChallenge({
        conversationId: conversationId ?? (await createConversation()),
        method: code === null ? 'CONTACT_SHARE' : 'OTP',
        patientId,
        code,
        expiresAt: new Date(Date.now() + 300_000),
        pendingBooking: {
          patientFullName: `${TEST_MARKER} booking`,
          phoneNumber: '628121000001',
          doctorId: patientId,
          scheduleId: patientId,
          sessionDate: '2026-09-01',
          note: null,
        },
      });
      return challenge.id;
    }

    it('accepts the code it stored and refuses every other', async () => {
      const challengeId = await createChallenge('123456');
      const now = new Date();

      await expect(
        challengeRepository.isCodeMatching(challengeId, '123456', now),
      ).resolves.toBe(true);
      await expect(
        challengeRepository.isCodeMatching(challengeId, '123457', now),
      ).resolves.toBe(false);
    });

    it('stores the code only as a hash', async () => {
      const challengeId = await createChallenge('654321');

      const row = await prisma.channelOtpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
        select: { codeHash: true },
      });

      // A live code is a working credential against someone else's record for
      // the next five minutes. It must not be readable from the table.
      expect(row.codeHash).not.toBeNull();
      expect(row.codeHash).not.toContain('654321');
    });

    it('stores no hash at all for a contact-share challenge', async () => {
      const challengeId = await createChallenge(null);

      const row = await prisma.channelOtpChallenge.findUniqueOrThrow({
        where: { id: challengeId },
        select: { codeHash: true, method: true },
      });

      expect(row).toEqual({ codeHash: null, method: 'CONTACT_SHARE' });
    });

    it('refuses a code once the challenge is consumed', async () => {
      const challengeId = await createChallenge('111222');
      await challengeRepository.consumeChallenge(challengeId, new Date());

      // Replay protection is the `consumed_at` column, not a check somebody
      // has to remember to write.
      await expect(
        challengeRepository.isCodeMatching(challengeId, '111222', new Date()),
      ).resolves.toBe(false);
    });

    it('refuses a code once the challenge has expired', async () => {
      const challengeId = await createChallenge('333444');

      await expect(
        challengeRepository.isCodeMatching(
          challengeId,
          '333444',
          new Date(Date.now() + 600_000),
        ),
      ).resolves.toBe(false);
    });

    it('finds only a live challenge for a conversation', async () => {
      const conversationId = await createConversation();
      const challengeId = await createChallenge('555666', conversationId);

      await expect(
        challengeRepository.findLiveChallenge(conversationId, new Date()),
      ).resolves.toMatchObject({ id: challengeId, method: 'OTP' });

      await challengeRepository.consumeChallenge(challengeId, new Date());

      await expect(
        challengeRepository.findLiveChallenge(conversationId, new Date()),
      ).resolves.toBeNull();
    });
  });
});
