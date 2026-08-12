import {
  CfnOutput,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
  Duration,
} from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const BUCKET_NAME = 'saling-jaga-dev-assets';
const ACCESS_ROLE_NAME = 'saling-jaga-dev-assets-access';
const APP_USER_NAME = 'saling-jaga-dev-assets-app';
const CREDENTIALS_SECRET_NAME = 'saling-jaga/dev/s3-assets-credentials';
const NONCURRENT_VERSIONS_TO_RETAIN = 5;
const NONCURRENT_VERSION_EXPIRATION_DAYS = 30;
const ABORT_INCOMPLETE_UPLOAD_DAYS = 7;
const MAX_ROLE_SESSION_HOURS = 4;

/**
 * Object storage for the `dev` environment, plus the two identities that reach it.
 *
 * Two access paths are provisioned deliberately:
 *
 * - `accessRole` — an assumable IAM role. This is the path to prefer: callers
 *   obtain short-lived STS credentials and nothing long-lived exists to leak.
 *   Roles have no permanent access key/secret pair.
 * - `appUser` — an IAM user with a long-lived access key, because
 *   `s3-storage.service.ts` reads static `S3_ACCESS_KEY_ID` /
 *   `S3_SECRET_ACCESS_KEY` credentials from the environment. Its secret is
 *   written to Secrets Manager rather than a stack output, so `cdk deploy`
 *   never prints it and it never lands in the CloudFormation console.
 */
export class DevAssetsStack extends Stack {
  public readonly assetsBucket: s3.Bucket;
  public readonly accessRole: iam.Role;
  public readonly credentialsSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: BUCKET_NAME,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // Dev data is still recoverable data. Flip to DESTROY (and add
      // autoDeleteObjects) only if this bucket is genuinely disposable.
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'expire-old-noncurrent-versions',
          noncurrentVersionsToRetain: NONCURRENT_VERSIONS_TO_RETAIN,
          noncurrentVersionExpiration: Duration.days(
            NONCURRENT_VERSION_EXPIRATION_DAYS,
          ),
          abortIncompleteMultipartUploadAfter: Duration.days(
            ABORT_INCOMPLETE_UPLOAD_DAYS,
          ),
        },
      ],
    });
    this.accessRole = new iam.Role(this, 'AssetsAccessRole', {
      roleName: ACCESS_ROLE_NAME,
      description: 'Read/write access to the saling-jaga dev assets bucket',
      // Any principal in this account may assume it, subject to its own IAM
      // policy. Narrow this to specific user/role ARNs once dev identities exist.
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(this.account),
        new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      ),
      maxSessionDuration: Duration.hours(MAX_ROLE_SESSION_HOURS),
    });
    this.assetsBucket.grantReadWrite(this.accessRole);
    const appUser: iam.User = new iam.User(this, 'AssetsAppUser', {
      userName: APP_USER_NAME,
    });
    this.assetsBucket.grantReadWrite(appUser);
    const accessKey: iam.AccessKey = new iam.AccessKey(this, 'AssetsAppKey', {
      user: appUser,
      // Increment to force a rotation on the next deploy.
      serial: 1,
    });
    this.credentialsSecret = new secretsmanager.Secret(
      this,
      'AssetsCredentials',
      {
        secretName: CREDENTIALS_SECRET_NAME,
        description: `Static S3 credentials for ${BUCKET_NAME} (dev only)`,
        removalPolicy: RemovalPolicy.DESTROY,
        secretObjectValue: {
          S3_ACCESS_KEY_ID: SecretValue.unsafePlainText(accessKey.accessKeyId),
          S3_SECRET_ACCESS_KEY: accessKey.secretAccessKey,
          S3_BUCKET: SecretValue.unsafePlainText(BUCKET_NAME),
          S3_REGION: SecretValue.unsafePlainText(this.region),
        },
      },
    );
    new CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      description: 'S3 bucket name',
    });
    new CfnOutput(this, 'AssetsAccessRoleArn', {
      value: this.accessRole.roleArn,
      description: 'Assume this role for short-lived credentials',
    });
    new CfnOutput(this, 'AssetsCredentialsSecretName', {
      value: this.credentialsSecret.secretName,
      description:
        'Secrets Manager entry holding the static access key/secret pair',
    });
  }
}
