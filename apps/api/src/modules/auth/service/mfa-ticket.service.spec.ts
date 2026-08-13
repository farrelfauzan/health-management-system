import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { JwtSecretsService } from '../../../common/config/jwt-secrets.service';
import { verifyWithAnySecret } from '../../../common/config/verify-with-any-secret';
import { MfaTicketService } from './mfa-ticket.service';

describe('MfaTicketService (SJ-8)', () => {
  const userId = '41f5da47-4151-4871-a391-106e7da1c02c';
  const jwtService = new JwtService();
  const configService = new ConfigService({ JWT_ACCESS_SECRET: 'test-access-secret' });
  const jwtSecrets = new JwtSecretsService(configService);
  const service = new MfaTicketService(jwtService, jwtSecrets);

  it('round-trips a ticket of the expected purpose', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_challenge');

    const actualClaims = await service.verifyTicket(inputTicket, 'mfa_challenge');

    expect(actualClaims.sub).toBe(userId);
    expect(actualClaims.purpose).toBe('mfa_challenge');
  });

  /**
   * The property the whole two-phase design rests on. `JwtAuthGuard` would
   * happily populate `request.user` from any token that verifies against the
   * access secret, and `PermissionsGuard` then reads permissions from the
   * database — so a ticket that verified as an access token would carry full
   * authority. Signing it with a derived key makes that a signature failure
   * rather than something a guard has to remember to check.
   */
  it('cannot be verified as an access token', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_challenge');

    await expect(
      verifyWithAnySecret(jwtService, inputTicket, jwtSecrets.getAccessVerificationSecrets()),
    ).rejects.toBeDefined();
  });

  it('refuses an access token presented as a ticket', async () => {
    const inputAccessToken = await jwtService.signAsync(
      { sub: userId, email: 'admin@hms.local', roles: [], permissions: [] },
      { secret: jwtSecrets.getAccessSigningSecret(), expiresIn: '15m' },
    );

    await expect(service.verifyTicket(inputAccessToken, 'mfa_challenge')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * A challenge ticket spent on enrolment would let anyone holding a stolen
   * password replace the victim's authenticator with their own — the password
   * alone would become enough to take the account over permanently.
   */
  it('refuses a challenge ticket on an enrolment route', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_challenge');

    await expect(service.verifyTicket(inputTicket, 'mfa_enrolment')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an enrolment ticket on a challenge route', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_enrolment');

    await expect(service.verifyTicket(inputTicket, 'mfa_challenge')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a ticket signed with a key the deployment no longer knows', async () => {
    const strangerSecrets = new JwtSecretsService(
      new ConfigService({ JWT_ACCESS_SECRET: 'someone-elses-secret' }),
    );
    const stranger = new MfaTicketService(jwtService, strangerSecrets);
    const inputTicket = await stranger.issueTicket(userId, 'mfa_challenge');

    await expect(service.verifyTicket(inputTicket, 'mfa_challenge')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * SJ-5's rotation story has to survive here too: a ticket minted seconds
   * before a key rotation must still be spendable, or rotating the access
   * secret would strand everyone mid-login.
   */
  it('still accepts a ticket signed with the previous key during a rotation', async () => {
    const beforeRotation = new MfaTicketService(
      jwtService,
      new JwtSecretsService(new ConfigService({ JWT_ACCESS_SECRET: 'old-access-secret' })),
    );
    const inputTicket = await beforeRotation.issueTicket(userId, 'mfa_challenge');
    const afterRotation = new MfaTicketService(
      jwtService,
      new JwtSecretsService(
        new ConfigService({
          JWT_ACCESS_SECRET: 'new-access-secret',
          JWT_ACCESS_SECRET_PREVIOUS: 'old-access-secret',
        }),
      ),
    );

    const actualClaims = await afterRotation.verifyTicket(inputTicket, 'mfa_challenge');

    expect(actualClaims.sub).toBe(userId);
  });

  it('gives every ticket a distinct id, so a spent one is identifiable', async () => {
    const firstTicket = await service.issueTicket(userId, 'mfa_challenge');
    const secondTicket = await service.issueTicket(userId, 'mfa_challenge');

    const firstClaims = await service.verifyTicket(firstTicket, 'mfa_challenge');
    const secondClaims = await service.verifyTicket(secondTicket, 'mfa_challenge');
    expect(firstClaims.jti).not.toBe(secondClaims.jti);
  });

  it('expires within two minutes', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_challenge');

    const decoded = jwtService.decode<{ exp: number; iat: number }>(inputTicket);
    expect(decoded.exp - decoded.iat).toBe(service.ticketLifetimeSeconds);
    expect(service.ticketLifetimeSeconds).toBeLessThanOrEqual(120);
  });

  it('carries no permissions, roles or email a caller could read as authority', async () => {
    const inputTicket = await service.issueTicket(userId, 'mfa_enrolment');

    const decoded = jwtService.decode<Record<string, unknown>>(inputTicket);
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'jti', 'purpose', 'sub']);
  });
});
