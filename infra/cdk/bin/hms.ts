#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { DevAssetsStack } from '../lib/dev-assets-stack';

// Jakarta, per docs/post-mvp/cloud-architecture.md §2.1 (UU PDP data residency).
// ap-southeast-3 is an opt-in region: enable it on the account before deploying,
// or override with CDK_DEPLOY_REGION for a throwaway environment.
const DEFAULT_REGION = 'ap-southeast-3';

const app: App = new App();

new DevAssetsStack(app, 'SalingJagaDevAssets', {
  env: {
    account: process.env.CDK_DEPLOY_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEPLOY_REGION ?? DEFAULT_REGION,
  },
  description: 'Dev object storage and access identities for Saling Jaga',
});

Tags.of(app).add('project', 'saling-jaga');
Tags.of(app).add('environment', 'dev');
Tags.of(app).add('managed-by', 'aws-cdk');

app.synth();
