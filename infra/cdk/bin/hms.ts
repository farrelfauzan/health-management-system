#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { DevAssetsStack } from '../lib/dev-assets-stack';
import { MailStack } from '../lib/mail-stack';

// Jakarta, per docs/post-mvp/cloud-architecture.md §2.1 (UU PDP data residency).
// ap-southeast-3 is an opt-in region: enable it on the account before deploying,
// or override with CDK_DEPLOY_REGION for a throwaway environment.
const DEFAULT_REGION = 'ap-southeast-3';

const app: App = new App();

const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION ?? DEFAULT_REGION,
};

new DevAssetsStack(app, 'SalingJagaDevAssets', {
  env,
  description: 'Dev object storage and access identities for Saling Jaga',
});

// The mail stack is opt-in on `-c mailSender=…`. Without it, `cdk synth` and
// `cdk deploy` behave exactly as they did before SES existed. There is no
// default sender, deliberately: SES mails a verification link to whatever it
// is given, so a guessed address is an email sent to a stranger, and a wrong
// one produces an identity that can never be verified and quietly fails every
// send.
const mailSender = app.node.tryGetContext('mailSender') as string | undefined;
if (mailSender) {
  const verifiedRecipients = (app.node.tryGetContext('mailRecipients') as string | undefined)
    ?.split(',')
    .map((address) => address.trim())
    .filter((address) => address !== '');
  new MailStack(app, 'SalingJagaMail', {
    env,
    description: 'SES SMTP transport for staff invitations (IMP-23)',
    senderAddress: mailSender,
    verifiedRecipients,
    mailDomain: app.node.tryGetContext('mailDomain') as string | undefined,
    hostedZoneName: app.node.tryGetContext('hostedZoneName') as string | undefined,
  });
}

Tags.of(app).add('project', 'saling-jaga');
Tags.of(app).add('environment', 'dev');
Tags.of(app).add('managed-by', 'aws-cdk');

app.synth();
