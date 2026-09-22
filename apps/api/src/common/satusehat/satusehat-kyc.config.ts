import { createPrivateKey, createPublicKey, KeyObject } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { resolveSatusehatEnvironment } from './resolve-satusehat-environment';
import { resolveSatusehatConfig } from './satusehat.config';
import { SatusehatKycConfig, SatusehatKycDisabledReason } from './satusehat.types';

const PRIVATE_KEY_VARIABLE = 'SATUSEHAT_KYC_PRIVATE_KEY';
const PUBLIC_KEY_VARIABLE = 'SATUSEHAT_KYC_PUBLIC_KEY';
const SERVER_PUBLIC_KEY_VARIABLE = 'SATUSEHAT_KYC_SERVER_PUBLIC_KEY';
const RSA_KEY_TYPE = 'rsa';

function readPem(configService: ConfigService, key: string): string | undefined {
  // A PEM in an environment variable usually arrives with its line breaks
  // escaped as the two characters `\n`; a secret store that keeps real line
  // breaks passes through untouched.
  const rawValue = configService.get<string>(key)?.replace(/\\n/g, '\n').trim();
  return rawValue === undefined || rawValue === '' ? undefined : rawValue;
}

function parsePrivateKey(pem: string): KeyObject | null {
  try {
    const key = createPrivateKey(pem);
    return key.asymmetricKeyType === RSA_KEY_TYPE ? key : null;
  } catch {
    return null;
  }
}

function parsePublicKey(pem: string): KeyObject | null {
  try {
    const key = createPublicKey(pem);
    return key.asymmetricKeyType === RSA_KEY_TYPE ? key : null;
  } catch {
    return null;
  }
}

function isMatchingKeyPair(privateKey: KeyObject, publicKey: KeyObject): boolean {
  const derivedPublicKey = createPublicKey(privateKey);
  return derivedPublicKey.equals(publicKey);
}

function disable(disabledReason: SatusehatKycDisabledReason): SatusehatKycConfig {
  return { isEnabled: false, disabledReason };
}

/**
 * Resolves the KYC key material (P24-T14, FR-KYC-01) without ever throwing.
 *
 * Unlike {@link resolveSatusehatConfig}, which refuses to boot on a malformed
 * value, a bad or missing KYC key **disables KYC with a reason**: the front
 * desk losing profile verification is a degraded feature, and taking the
 * whole API down with it — Encounter submission, the worker, every screen —
 * would be the wrong trade. The three PEMs are all-or-nothing, as the
 * credential trio is: a deployment with two of them is misconfigured, not
 * half-enabled, and the reason says so.
 *
 * Also disabled when the KYC URL points at a different platform than the
 * FHIR URL. A half-switched deployment would send a production operator's
 * NIK to the staging KYC service, or the reverse; the environment card only
 * reads the FHIR URL (P21-T06), so nothing else would make that visible.
 */
export function resolveSatusehatKycConfig(configService: ConfigService): SatusehatKycConfig {
  const satusehatConfig = resolveSatusehatConfig(configService);
  if (!satusehatConfig.isConfigured) {
    return disable('SATUSEHAT_NOT_CONFIGURED');
  }
  const privateKeyPem = readPem(configService, PRIVATE_KEY_VARIABLE);
  const publicKeyPem = readPem(configService, PUBLIC_KEY_VARIABLE);
  const serverPublicKeyPem = readPem(configService, SERVER_PUBLIC_KEY_VARIABLE);
  const providedCount = [privateKeyPem, publicKeyPem, serverPublicKeyPem].filter(
    (value) => value !== undefined,
  ).length;
  if (providedCount === 0) {
    return disable('KYC_KEYS_NOT_CONFIGURED');
  }
  if (
    privateKeyPem === undefined ||
    publicKeyPem === undefined ||
    serverPublicKeyPem === undefined
  ) {
    return disable('KYC_KEYS_INCOMPLETE');
  }
  const privateKey = parsePrivateKey(privateKeyPem);
  if (privateKey === null) {
    return disable('KYC_PRIVATE_KEY_INVALID');
  }
  const publicKey = parsePublicKey(publicKeyPem);
  if (publicKey === null) {
    return disable('KYC_PUBLIC_KEY_INVALID');
  }
  const serverPublicKey = parsePublicKey(serverPublicKeyPem);
  if (serverPublicKey === null) {
    return disable('KYC_SERVER_PUBLIC_KEY_INVALID');
  }
  if (!isMatchingKeyPair(privateKey, publicKey)) {
    return disable('KYC_KEY_PAIR_MISMATCH');
  }
  if (
    resolveSatusehatEnvironment(satusehatConfig.kycBaseUrl) !==
    resolveSatusehatEnvironment(satusehatConfig.fhirBaseUrl)
  ) {
    return disable('KYC_PLATFORM_MISMATCH');
  }
  return {
    isEnabled: true,
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    serverPublicKey,
  };
}
