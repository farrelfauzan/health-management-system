#!/usr/bin/env node
/**
 * Derives an SES SMTP password from an IAM secret access key.
 *
 * SES's SMTP password is not the IAM secret — it is an HMAC-SHA256 chain over
 * the AWS SigV4 date/region/service/terminator constants, keyed by the secret,
 * with a version byte prepended. CDK cannot compute it at synth time because
 * the secret is an unresolved CloudFormation token, so this runs locally,
 * against the secret you already have access to, and prints the result to your
 * terminal and nowhere else.
 *
 * Reads the Secrets Manager `SecretString` JSON on stdin:
 *
 *   aws secretsmanager get-secret-value --secret-id saling-jaga/mail/ses-smtp-credentials \
 *     --query SecretString --output text | node derive-smtp-password.mjs ap-southeast-1
 *
 * The output is `MAIL_PASSWORD`. Paste it into apps/api/.env yourself — do not
 * commit it, and do not paste it into a chat, a ticket, or a PR.
 */
import { createHmac } from 'node:crypto';

const DATE = '11111111';
const SERVICE = 'ses';
const TERMINATOR = 'aws4_request';
const MESSAGE = 'SendRawEmail';
const VERSION = 0x04;

function sign(key, value) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function deriveSmtpPassword(secretAccessKey, region) {
  let signature = sign(`AWS4${secretAccessKey}`, DATE);
  signature = sign(signature, region);
  signature = sign(signature, SERVICE);
  signature = sign(signature, TERMINATOR);
  signature = sign(signature, MESSAGE);
  return Buffer.concat([Buffer.from([VERSION]), signature]).toString('base64');
}

const region = process.argv[2];
if (!region) {
  console.error('Usage: … | derive-smtp-password.mjs <region>');
  process.exit(1);
}

const stdin = await new Promise((resolve, reject) => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
  });
  process.stdin.on('end', () => resolve(buffer.trim()));
  process.stdin.on('error', reject);
});

const secretAccessKey = stdin.startsWith('{')
  ? JSON.parse(stdin).IAM_SECRET_ACCESS_KEY
  : stdin;

if (!secretAccessKey) {
  console.error('No IAM_SECRET_ACCESS_KEY found on stdin');
  process.exit(1);
}

console.log(deriveSmtpPassword(secretAccessKey, region));
