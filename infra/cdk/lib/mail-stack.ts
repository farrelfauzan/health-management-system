import { CfnOutput, RemovalPolicy, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

const SMTP_USER_NAME = 'saling-jaga-mail-smtp';
const CREDENTIALS_SECRET_NAME = 'saling-jaga/mail/ses-smtp-credentials';
const CONFIGURATION_SET_NAME = 'saling-jaga-transactional';
const SMTP_STARTTLS_PORT = 587;

export type MailStackProps = StackProps & {
  /**
   * The address the API sends from. Verified as an identity in its own right
   * when `mailDomain` is absent, which is the sandbox-friendly path: no DNS
   * access needed, at the cost of DKIM (Easy DKIM is domain-level only).
   */
  readonly senderAddress: string;
  /**
   * Extra addresses to verify as *recipients*. Only meaningful in the SES
   * sandbox, where a message to an unverified address is rejected — so
   * without these, an invitation sent to a real colleague silently fails.
   * Ignored once production access is granted, at which point they can be
   * dropped from the stack.
   */
  readonly verifiedRecipients?: readonly string[];
  /**
   * Verify the whole domain instead, with Easy DKIM and a custom MAIL FROM.
   * This is where a real deployment has to end up — address identities do not
   * sign, and an unsigned "set your password" link is a spam-folder candidate.
   * Requires DNS access for the CNAMEs SES asks for.
   */
  readonly mailDomain?: string;
  /**
   * Name of a **public** Route 53 hosted zone for `mailDomain`, when one
   * exists in this account. Supplying it lets CDK write the DKIM and MAIL FROM
   * records itself; without it they are emitted as stack outputs for whoever
   * runs the DNS to add by hand.
   */
  readonly hostedZoneName?: string;
};

/**
 * Amazon SES as the transport behind `MailService` (IMP-23).
 *
 * The API speaks plain SMTP — `SmtpMailService` is provider-neutral by design
 * — so this stack provisions SES's *SMTP interface* rather than the SES API.
 * That keeps the choice of vendor a deployment decision: moving to Postmark or
 * Brevo later is six environment variables, not a code change.
 *
 * ## What this stack cannot do
 *
 * **It cannot leave the SES sandbox.** A new account may only send to
 * addresses it has separately verified, at 200 messages a day. Production
 * access is a manual request in the SES console that AWS reviews by hand
 * (typically within a day), and no CloudFormation resource represents it. So a
 * successful `cdk deploy` still leaves invitations undeliverable to real staff
 * addresses until that request is granted — check with
 * `aws sesv2 get-account --query ProductionAccessEnabled`.
 *
 * **It cannot complete address verification.** SES emails a confirmation link
 * to every address identity here; somebody has to open each mailbox and click
 * it. Until then the identity exists but sends nothing, and CloudFormation
 * still reports the deploy as successful.
 *
 * **It cannot compute the SMTP password.** SES's SMTP password is not the IAM
 * secret access key; it is an HMAC-SHA256 derivation of it, keyed by region.
 * The secret only exists as an unresolved token at synth time, so the raw IAM
 * pair is written to Secrets Manager and the derivation is left to
 * `scripts/derive-smtp-password.mjs`, run locally by whoever configures the
 * deployment. That also means this stack never prints a usable credential.
 */
export class MailStack extends Stack {
  public readonly credentialsSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: MailStackProps) {
    super(scope, id, props);

    const configurationSet = new ses.ConfigurationSet(this, 'TransactionalConfigurationSet', {
      configurationSetName: CONFIGURATION_SET_NAME,
      // Invitations carry a single-use credential. A message that would fall
      // back to plaintext because the recipient's MTA does not offer STARTTLS
      // must not be sent at all.
      tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
      reputationMetrics: true,
    });

    const sendableIdentityArns = props.mailDomain
      ? [this.addDomainIdentity(props.mailDomain, props.hostedZoneName, configurationSet)]
      : [this.addAddressIdentity('SenderIdentity', props.senderAddress, configurationSet)];

    // Recipient identities exist only to satisfy the sandbox. They are not
    // added to `sendableIdentityArns` — the SMTP user must never be able to
    // send *as* a colleague's mailbox just because it was verified for
    // delivery.
    for (const [index, recipient] of (props.verifiedRecipients ?? []).entries()) {
      this.addAddressIdentity(`RecipientIdentity${index}`, recipient, configurationSet);
    }

    const smtpUser = new iam.User(this, 'MailSmtpUser', {
      userName: SMTP_USER_NAME,
    });
    // `ses:SendRawEmail` is what the SMTP interface authorises against. Scoped
    // to the sending identity and this configuration set so a leaked
    // credential cannot send as any other identity in the account, nor bypass
    // the TLS policy above by naming a different configuration set.
    smtpUser.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendRawEmail'],
        resources: [
          ...sendableIdentityArns,
          `arn:aws:ses:${this.region}:${this.account}:configuration-set/${CONFIGURATION_SET_NAME}`,
        ],
        conditions: {
          StringEquals: {
            'ses:FromAddress': props.senderAddress,
          },
        },
      }),
    );

    const accessKey = new iam.AccessKey(this, 'MailSmtpKey', {
      user: smtpUser,
      // Increment to force a rotation on the next deploy.
      serial: 1,
    });

    this.credentialsSecret = new secretsmanager.Secret(this, 'MailSmtpCredentials', {
      secretName: CREDENTIALS_SECRET_NAME,
      description: `SES SMTP IAM credentials for ${props.senderAddress}`,
      removalPolicy: RemovalPolicy.DESTROY,
      secretObjectValue: {
        // The SMTP *username* is the access key id verbatim. The SMTP
        // *password* is derived from the secret below — deliberately not
        // stored here, because storing a value this stack cannot compute would
        // mean storing a wrong one.
        MAIL_USER: SecretValue.unsafePlainText(accessKey.accessKeyId),
        IAM_SECRET_ACCESS_KEY: accessKey.secretAccessKey,
        MAIL_HOST: SecretValue.unsafePlainText(`email-smtp.${this.region}.amazonaws.com`),
        MAIL_PORT: SecretValue.unsafePlainText(String(SMTP_STARTTLS_PORT)),
        MAIL_FROM: SecretValue.unsafePlainText(`Saling Jaga <${props.senderAddress}>`),
      },
    });

    new CfnOutput(this, 'MailHost', {
      value: `email-smtp.${this.region}.amazonaws.com`,
      description: 'MAIL_HOST — SES SMTP endpoint for this region',
    });
    new CfnOutput(this, 'MailPort', {
      value: String(SMTP_STARTTLS_PORT),
      description: 'MAIL_PORT — STARTTLS. Leave MAIL_SECURE false on this port',
    });
    new CfnOutput(this, 'MailFrom', {
      value: `Saling Jaga <${props.senderAddress}>`,
      description: 'MAIL_FROM — SES rejects any From address it has not verified',
    });
    new CfnOutput(this, 'MailCredentialsSecretName', {
      value: this.credentialsSecret.secretName,
      description: 'Secrets Manager entry holding the SMTP username and the IAM secret',
    });
    // The first step differs by identity type and saying the wrong one costs
    // real time: a domain is verified purely through DNS and SES sends no mail
    // at all, so "click the link" sends someone hunting a mailbox — which, for
    // a domain with no MX, does not exist.
    const verificationStep = props.mailDomain
      ? `1. Add the DKIM and MAIL FROM records above to DNS for ${props.mailDomain}. No verification email is sent for a domain identity — verification is the DNS records alone.`
      : `1. Click the SES verification link mailed to ${props.senderAddress} (and to every verified recipient).`;
    new CfnOutput(this, 'MailNextSteps', {
      value: [
        verificationStep,
        '2. Derive MAIL_PASSWORD locally:',
        `aws secretsmanager get-secret-value --secret-id ${CREDENTIALS_SECRET_NAME} --query SecretString --output text | node infra/cdk/scripts/derive-smtp-password.mjs ${this.region}`,
        '3. SES is in sandbox until AWS grants production access in the console —',
        'until then it delivers only to verified addresses, 200/day.',
      ].join(' '),
      description: 'Read before assuming a successful deploy means working mail',
    });
  }

  private addAddressIdentity(
    id: string,
    address: string,
    configurationSet: ses.ConfigurationSet,
  ): string {
    new ses.EmailIdentity(this, id, {
      identity: ses.Identity.email(address),
      configurationSet,
    });
    return `arn:aws:ses:${this.region}:${this.account}:identity/${address}`;
  }

  private addDomainIdentity(
    domain: string,
    hostedZoneName: string | undefined,
    configurationSet: ses.ConfigurationSet,
  ): string {
    const identity = new ses.EmailIdentity(this, 'MailDomainIdentity', {
      identity: hostedZoneName
        ? ses.Identity.publicHostedZone(
            route53.PublicHostedZone.fromLookup(this, 'MailHostedZone', {
              domainName: hostedZoneName,
            }),
          )
        : ses.Identity.domain(domain),
      configurationSet,
      // Easy DKIM at 2048 bits. Signing is what stops a plain "set your
      // password" link from landing in spam, and an invitation nobody receives
      // is indistinguishable from a broken feature.
      dkimSigning: true,
      mailFromDomain: `bounce.${domain}`,
    });
    if (!hostedZoneName) {
      this.emitManualDnsRecords(identity, domain);
    }
    return `arn:aws:ses:${this.region}:${this.account}:identity/${domain}`;
  }

  /**
   * Emits the records SES needs, for a domain whose DNS this account does not
   * control — Cloudflare, a registrar's panel, anywhere that is not a Route 53
   * public hosted zone.
   *
   * They are outputs rather than resources because CloudFormation cannot write
   * to a nameserver it has no credentials for. Nothing verifies until somebody
   * pastes these in, and CloudFormation will report the deploy as successful
   * the whole time it has not happened.
   *
   * On Cloudflare specifically: every one of these must be **DNS only** (grey
   * cloud). A proxied DKIM CNAME resolves to Cloudflare's own address and SES
   * reads that as the record being wrong, which presents as a verification
   * that never completes rather than as an error.
   */
  private emitManualDnsRecords(identity: ses.EmailIdentity, domain: string): void {
    const dkimRecords = [
      { name: identity.dkimDnsTokenName1, value: identity.dkimDnsTokenValue1 },
      { name: identity.dkimDnsTokenName2, value: identity.dkimDnsTokenValue2 },
      { name: identity.dkimDnsTokenName3, value: identity.dkimDnsTokenValue3 },
    ];
    for (const [index, record] of dkimRecords.entries()) {
      new CfnOutput(this, `DkimRecord${index + 1}`, {
        value: `CNAME ${record.name} -> ${record.value}`,
        description: `DKIM record ${index + 1} of 3 — add to DNS, proxying off`,
      });
    }
    new CfnOutput(this, 'MailFromMxRecord', {
      value: `MX bounce.${domain} -> 10 feedback-smtp.${this.region}.amazonses.com`,
      description: 'Custom MAIL FROM bounce handling — add to DNS, proxying off',
    });
    new CfnOutput(this, 'MailFromSpfRecord', {
      value: `TXT bounce.${domain} -> "v=spf1 include:amazonses.com ~all"`,
      description: 'SPF for the MAIL FROM subdomain — add to DNS',
    });
    new CfnOutput(this, 'DmarcRecordSuggestion', {
      value: `TXT _dmarc.${domain} -> "v=DMARC1; p=none; rua=mailto:dmarc@${domain}"`,
      description:
        'Not required by SES, but a domain with DKIM and no DMARC gets no feedback when someone spoofs it. Start at p=none and tighten once reports look clean',
    });
  }
}
