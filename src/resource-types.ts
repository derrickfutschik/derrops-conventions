import type { ResourceTypeConfig } from './types.js'

/**
 * All supported AWS resource types with their naming configuration.
 *
 * global: true  → name includes region + env (globally unique namespace)
 * global: false → name omits region + env (account provides namespace isolation)
 *
 * segments: explicit ordered list overrides the global/instance-order logic.
 * Used for DNS types (reversed hierarchy) and types with fixed segment subsets.
 *
 * arn: ARN construction metadata for IAM policy generation.
 * permissions: curated IAM action sets per permission tier (read / readWrite / manage).
 * Types without `arn` are sub-resources or naming helpers — not direct policy targets.
 */
export const RESOURCE_TYPES = {
  // ── S3 ───────────────────────────────────────────────────────────────────
  s3Bucket: {
    global: true,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 's3',
    // policyResourceSuffix emits both bucket ARN and objects ARN in policy statements
    arn: { service: 's3', includeRegion: false, includeAccount: false, policyResourceSuffix: '/*' },
    permissions: {
      read: ['s3:Get*', 's3:List*'],
      readWrite: ['s3:Get*', 's3:List*', 's3:Put*', 's3:Delete*'],
      manage: ['s3:*'],
    },
  },
  s3ObjectKey: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
  },
  s3LogKey: {
    // object key for time-series log data; partition segment carries the date path
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
  },

  // ── CloudWatch ───────────────────────────────────────────────────────────
  cloudwatchLogsGroup: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    iamService: 'logs',
    arn: {
      service: 'logs',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'log-group:',
    },
    permissions: {
      read: [
        'logs:Get*',
        'logs:List*',
        'logs:Describe*',
        'logs:Filter*',
        'logs:StartQuery',
        'logs:StopQuery',
      ],
      readWrite: [
        'logs:Get*',
        'logs:List*',
        'logs:Describe*',
        'logs:Filter*',
        'logs:StartQuery',
        'logs:StopQuery',
        'logs:Put*',
        'logs:Create*',
        'logs:Delete*',
      ],
      manage: ['logs:*'],
    },
  },
  cloudwatchMetricNamespace: {
    // namespace is org/domain only; service goes into Dimensions
    // not a direct IAM ARN target — policies use '*' for CloudWatch metrics
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
    iamService: 'cloudwatch',
  },

  // ── ECR / ECS ────────────────────────────────────────────────────────────
  ecr: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    iamService: 'ecr',
    arn: {
      service: 'ecr',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'repository/',
    },
    permissions: {
      read: ['ecr:Get*', 'ecr:List*', 'ecr:Describe*', 'ecr:BatchGet*'],
      readWrite: [
        'ecr:Get*',
        'ecr:List*',
        'ecr:Describe*',
        'ecr:BatchGet*',
        'ecr:Put*',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:BatchDelete*',
      ],
      manage: ['ecr:*'],
    },
  },
  ecsCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'ecs',
    arn: { service: 'ecs', includeRegion: true, includeAccount: true, resourcePrefix: 'cluster/' },
    permissions: {
      read: ['ecs:Describe*', 'ecs:List*'],
      readWrite: [
        'ecs:Describe*',
        'ecs:List*',
        'ecs:RunTask',
        'ecs:StartTask',
        'ecs:StopTask',
        'ecs:Update*',
      ],
      manage: ['ecs:*'],
    },
  },
  ecsService: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'ecs',
    arn: { service: 'ecs', includeRegion: true, includeAccount: true, resourcePrefix: 'service/' },
    permissions: {
      read: ['ecs:Describe*', 'ecs:List*'],
      readWrite: ['ecs:Describe*', 'ecs:List*', 'ecs:Update*'],
      manage: ['ecs:*'],
    },
  },
  ecsTaskDefinition: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'ecs',
    arn: {
      service: 'ecs',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'task-definition/',
    },
    permissions: {
      read: ['ecs:Describe*', 'ecs:List*'],
      readWrite: [
        'ecs:Describe*',
        'ecs:List*',
        'ecs:RegisterTaskDefinition',
        'ecs:DeregisterTaskDefinition',
      ],
      manage: ['ecs:*'],
    },
  },

  // ── Databases ────────────────────────────────────────────────────────────
  dynamoDb: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'dynamodb',
    arn: {
      service: 'dynamodb',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'table/',
    },
    permissions: {
      read: [
        'dynamodb:Get*',
        'dynamodb:BatchGet*',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:Describe*',
      ],
      readWrite: [
        'dynamodb:Get*',
        'dynamodb:BatchGet*',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:Describe*',
        'dynamodb:Put*',
        'dynamodb:Update*',
        'dynamodb:Delete*',
        'dynamodb:BatchWrite*',
      ],
      manage: ['dynamodb:*'],
    },
  },
  dynamoDbGsi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--gsi',
    iamService: 'dynamodb',
    // resourceSuffix '/index/*' grants access to all indexes on the named table
    arn: {
      service: 'dynamodb',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'table/',
      resourceSuffix: '/index/*',
    },
    permissions: {
      read: [
        'dynamodb:Get*',
        'dynamodb:BatchGet*',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:Describe*',
      ],
      readWrite: [
        'dynamodb:Get*',
        'dynamodb:BatchGet*',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:Describe*',
        'dynamodb:Put*',
        'dynamodb:Update*',
        'dynamodb:Delete*',
        'dynamodb:BatchWrite*',
      ],
      manage: ['dynamodb:*'],
    },
  },
  rdsInstance: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'rds',
    arn: { service: 'rds', includeRegion: true, includeAccount: true, resourcePrefix: 'db:' },
    permissions: {
      read: ['rds:Describe*', 'rds:List*'],
      readWrite: ['rds:Describe*', 'rds:List*', 'rds-data:*'],
      manage: ['rds:*', 'rds-data:*'],
    },
  },
  rdsDbName: {
    // DB-internal names use underscores (not hyphens)
    global: false,
    segmentDelimiter: '_',
    wordDelimiter: '_',
  },
  rdsParameterGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'rds',
    arn: { service: 'rds', includeRegion: true, includeAccount: true, resourcePrefix: 'pg:' },
    permissions: {
      read: ['rds:Describe*'],
      readWrite: ['rds:Describe*', 'rds:Modify*', 'rds:Create*', 'rds:Delete*'],
      manage: ['rds:*'],
    },
  },
  rdsSubnetGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'rds',
    arn: { service: 'rds', includeRegion: true, includeAccount: true, resourcePrefix: 'subgrp:' },
    permissions: {
      read: ['rds:Describe*'],
      readWrite: ['rds:Describe*', 'rds:Modify*', 'rds:Create*', 'rds:Delete*'],
      manage: ['rds:*'],
    },
  },
  rdsProxy: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'rds',
    arn: { service: 'rds', includeRegion: true, includeAccount: true, resourcePrefix: 'db-proxy:' },
    permissions: {
      read: ['rds:Describe*'],
      readWrite: ['rds:Describe*', 'rds:Modify*'],
      manage: ['rds:*'],
    },
  },

  // ── Compute ──────────────────────────────────────────────────────────────
  ec2Instance: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'kind', 'num'],
  },
  ec2SecurityGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'purpose'],
  },
  ec2Volume: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'purpose'],
  },
  ec2ElasticIp: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service'],
    suffix: '--eip',
  },
  lambdaFunction: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'lambda',
    arn: {
      service: 'lambda',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'function:',
    },
    permissions: {
      read: ['lambda:Get*', 'lambda:List*'],
      readWrite: ['lambda:Get*', 'lambda:List*', 'lambda:InvokeFunction'],
      manage: ['lambda:*'],
    },
  },
  lambdaLayer: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'lambda',
    arn: { service: 'lambda', includeRegion: true, includeAccount: true, resourcePrefix: 'layer:' },
    permissions: {
      read: ['lambda:Get*', 'lambda:List*'],
      readWrite: ['lambda:Get*', 'lambda:List*', 'lambda:PublishLayerVersion'],
      manage: ['lambda:*'],
    },
  },
  autoScalingGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service'],
    suffix: '--asg',
  },
  launchTemplate: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── IAM ──────────────────────────────────────────────────────────────────
  iamRole: {
    // generates the IAM path: /{org}/{domain}/{service}/{key}
    // leading '/' from name acts as separator after 'role' in the ARN
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    iamService: 'iam',
    arn: { service: 'iam', includeRegion: false, includeAccount: true, resourcePrefix: 'role' },
    permissions: {
      read: ['iam:Get*', 'iam:List*'],
      readWrite: ['iam:Get*', 'iam:List*', 'iam:PassRole'],
      manage: ['iam:*'],
    },
  },
  iamPolicy: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'iam',
    arn: { service: 'iam', includeRegion: false, includeAccount: true, resourcePrefix: 'policy/' },
    permissions: {
      read: ['iam:Get*', 'iam:List*'],
      readWrite: ['iam:Get*', 'iam:List*', 'iam:Attach*', 'iam:Detach*'],
      manage: ['iam:*'],
    },
  },
  iamUser: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'iam',
    arn: { service: 'iam', includeRegion: false, includeAccount: true, resourcePrefix: 'user/' },
    permissions: {
      read: ['iam:Get*', 'iam:List*'],
      readWrite: ['iam:Get*', 'iam:List*', 'iam:Update*', 'iam:Create*', 'iam:Delete*'],
      manage: ['iam:*'],
    },
  },
  iamPath: {
    // path prefix for organising roles/users: /{org}/{domain}/{service}/
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
  },

  // ── DNS / Route53 / CloudFront / ACM ─────────────────────────────────────
  route53HostedZone: {
    // env.org.com — reversed hierarchy; env is the subdomain of the apex
    global: true,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['env', 'org'],
  },
  route53Record: {
    // service.env.org.com — reversed hierarchy
    global: true,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'env', 'org'],
  },
  route53PrivateRecord: {
    // service.internal.env.org.com
    global: true,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'env', 'org'],
  },
  cloudFrontDistribution: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'cloudfront',
    arn: {
      service: 'cloudfront',
      includeRegion: false,
      includeAccount: true,
      resourcePrefix: 'distribution/',
    },
    permissions: {
      read: ['cloudfront:Get*', 'cloudfront:List*', 'cloudfront:Describe*'],
      readWrite: [
        'cloudfront:Get*',
        'cloudfront:List*',
        'cloudfront:Describe*',
        'cloudfront:Update*',
        'cloudfront:CreateInvalidation',
      ],
      manage: ['cloudfront:*'],
    },
  },
  cloudFrontAlias: {
    // service.env.org.com — same reversed DNS pattern
    global: true,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'env', 'org'],
  },
  acmCertificate: {
    // service.env.org.com
    global: true,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'env', 'org'],
  },

  // ── Networking ───────────────────────────────────────────────────────────
  vpc: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  subnet: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'kind', 'az'],
  },
  routeTable: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  networkAcl: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service'],
    suffix: '--nacl',
  },
  alb: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  targetGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'purpose'],
  },

  // ── Messaging ────────────────────────────────────────────────────────────
  snsTopic: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'sns',
    arn: { service: 'sns', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['sns:Get*', 'sns:List*'],
      readWrite: ['sns:Get*', 'sns:List*', 'sns:Publish'],
      manage: ['sns:*'],
    },
  },
  sqsQueue: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'sqs',
    arn: { service: 'sqs', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['sqs:Get*', 'sqs:List*', 'sqs:ReceiveMessage'],
      readWrite: [
        'sqs:Get*',
        'sqs:List*',
        'sqs:ReceiveMessage',
        'sqs:SendMessage',
        'sqs:DeleteMessage',
        'sqs:ChangeMessageVisibility',
      ],
      manage: ['sqs:*'],
    },
  },
  sqsFifoQueue: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '.fifo',
    iamService: 'sqs',
    arn: { service: 'sqs', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['sqs:Get*', 'sqs:List*', 'sqs:ReceiveMessage'],
      readWrite: [
        'sqs:Get*',
        'sqs:List*',
        'sqs:ReceiveMessage',
        'sqs:SendMessage',
        'sqs:DeleteMessage',
        'sqs:ChangeMessageVisibility',
      ],
      manage: ['sqs:*'],
    },
  },
  sqsDlq: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--dlq',
    iamService: 'sqs',
    arn: { service: 'sqs', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['sqs:Get*', 'sqs:List*', 'sqs:ReceiveMessage'],
      readWrite: [
        'sqs:Get*',
        'sqs:List*',
        'sqs:ReceiveMessage',
        'sqs:SendMessage',
        'sqs:DeleteMessage',
        'sqs:ChangeMessageVisibility',
      ],
      manage: ['sqs:*'],
    },
  },
  kinesisStream: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'kinesis',
    arn: {
      service: 'kinesis',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'stream/',
    },
    permissions: {
      read: ['kinesis:Get*', 'kinesis:List*', 'kinesis:Describe*'],
      readWrite: ['kinesis:Get*', 'kinesis:List*', 'kinesis:Describe*', 'kinesis:Put*'],
      manage: ['kinesis:*'],
    },
  },
  eventBridgeBus: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'events',
    arn: {
      service: 'events',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'event-bus/',
    },
    permissions: {
      read: ['events:Describe*', 'events:List*'],
      readWrite: ['events:Describe*', 'events:List*', 'events:PutEvents'],
      manage: ['events:*'],
    },
  },
  eventBridgeRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-rule',
    iamService: 'events',
    arn: { service: 'events', includeRegion: true, includeAccount: true, resourcePrefix: 'rule/' },
    permissions: {
      read: ['events:Describe*', 'events:List*'],
      readWrite: [
        'events:Describe*',
        'events:List*',
        'events:Put*',
        'events:Delete*',
        'events:Enable*',
        'events:Disable*',
      ],
      manage: ['events:*'],
    },
  },
  kafkaTopic: {
    // native dot-delimited hierarchy: org.domain.service.key
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
  },

  // ── Integration / API ────────────────────────────────────────────────────
  apiGatewayRestApi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'execute-api',
    arn: { service: 'execute-api', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['execute-api:Invoke'],
      readWrite: ['execute-api:Invoke', 'execute-api:ManageConnections'],
      manage: ['execute-api:*'],
    },
  },
  apiGatewayHttpApi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'execute-api',
    arn: { service: 'execute-api', includeRegion: true, includeAccount: true },
    permissions: {
      read: ['execute-api:Invoke'],
      readWrite: ['execute-api:Invoke', 'execute-api:ManageConnections'],
      manage: ['execute-api:*'],
    },
  },
  apiGatewayKey: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'consumer'],
  },
  appSyncApi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  stepFunctions: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'states',
    arn: {
      service: 'states',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'stateMachine:',
    },
    permissions: {
      read: ['states:Describe*', 'states:List*', 'states:Get*'],
      readWrite: [
        'states:Describe*',
        'states:List*',
        'states:Get*',
        'states:StartExecution',
        'states:StopExecution',
        'states:SendTaskSuccess',
        'states:SendTaskFailure',
        'states:SendTaskHeartbeat',
      ],
      manage: ['states:*'],
    },
  },

  // ── Caching / Search ─────────────────────────────────────────────────────
  elastiCacheCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'elasticache',
    arn: {
      service: 'elasticache',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'cluster:',
    },
    permissions: {
      read: ['elasticache:Describe*', 'elasticache:List*'],
      readWrite: ['elasticache:Describe*', 'elasticache:List*', 'elasticache:Modify*'],
      manage: ['elasticache:*'],
    },
  },
  elastiCacheReplicationGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'elasticache',
    arn: {
      service: 'elasticache',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'replicationgroup:',
    },
    permissions: {
      read: ['elasticache:Describe*', 'elasticache:List*'],
      readWrite: ['elasticache:Describe*', 'elasticache:List*', 'elasticache:Modify*'],
      manage: ['elasticache:*'],
    },
  },
  openSearchDomain: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'es',
    arn: { service: 'es', includeRegion: true, includeAccount: true, resourcePrefix: 'domain/' },
    permissions: {
      read: ['es:Describe*', 'es:List*', 'es:ESHttpGet', 'es:ESHttpHead'],
      readWrite: ['es:Describe*', 'es:List*', 'es:ESHttp*'],
      manage: ['es:*'],
    },
  },
  openSearchIndex: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'tenant', 'domain', 'entity'],
  },

  // ── Config / Secrets ─────────────────────────────────────────────────────
  ssmParam: {
    // leading '/' from name acts as separator after 'parameter' in the ARN
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    iamService: 'ssm',
    arn: { service: 'ssm', includeRegion: true, includeAccount: true, resourcePrefix: 'parameter' },
    permissions: {
      read: ['ssm:GetParameter*', 'ssm:DescribeParameters'],
      readWrite: [
        'ssm:GetParameter*',
        'ssm:DescribeParameters',
        'ssm:PutParameter',
        'ssm:DeleteParameter*',
      ],
      manage: ['ssm:*'],
    },
  },
  secretsManager: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    iamService: 'secretsmanager',
    arn: {
      service: 'secretsmanager',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'secret:',
    },
    permissions: {
      read: ['secretsmanager:GetSecretValue', 'secretsmanager:Describe*', 'secretsmanager:List*'],
      readWrite: [
        'secretsmanager:GetSecretValue',
        'secretsmanager:Describe*',
        'secretsmanager:List*',
        'secretsmanager:PutSecretValue',
        'secretsmanager:UpdateSecret',
      ],
      manage: ['secretsmanager:*'],
    },
  },
  appConfigApplication: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'appconfig',
    arn: {
      service: 'appconfig',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'application/',
    },
    permissions: {
      read: ['appconfig:Get*', 'appconfig:List*'],
      readWrite: [
        'appconfig:Get*',
        'appconfig:List*',
        'appconfig:Create*',
        'appconfig:Update*',
        'appconfig:Delete*',
      ],
      manage: ['appconfig:*'],
    },
  },

  // ── Data / Analytics ─────────────────────────────────────────────────────
  glueDatabase: {
    global: false,
    segmentDelimiter: '_',
    wordDelimiter: '_',
    iamService: 'glue',
    arn: {
      service: 'glue',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'database/',
    },
    permissions: {
      read: ['glue:Get*', 'glue:List*'],
      readWrite: ['glue:Get*', 'glue:List*', 'glue:Create*', 'glue:Update*', 'glue:Delete*'],
      manage: ['glue:*'],
    },
  },
  glueJob: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-job',
    iamService: 'glue',
    arn: { service: 'glue', includeRegion: true, includeAccount: true, resourcePrefix: 'job/' },
    permissions: {
      read: ['glue:Get*', 'glue:List*'],
      readWrite: ['glue:Get*', 'glue:List*', 'glue:StartJobRun', 'glue:StopJobRun', 'glue:Update*'],
      manage: ['glue:*'],
    },
  },
  glueCrawler: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-crawler',
    iamService: 'glue',
    arn: { service: 'glue', includeRegion: true, includeAccount: true, resourcePrefix: 'crawler/' },
    permissions: {
      read: ['glue:Get*', 'glue:List*'],
      readWrite: [
        'glue:Get*',
        'glue:List*',
        'glue:StartCrawler',
        'glue:StopCrawler',
        'glue:Update*',
      ],
      manage: ['glue:*'],
    },
  },
  athenaWorkgroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'athena',
    arn: {
      service: 'athena',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'workgroup/',
    },
    permissions: {
      read: ['athena:Get*', 'athena:List*', 'athena:BatchGet*'],
      readWrite: [
        'athena:Get*',
        'athena:List*',
        'athena:BatchGet*',
        'athena:StartQueryExecution',
        'athena:StopQueryExecution',
      ],
      manage: ['athena:*'],
    },
  },
  redshiftCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  redshiftDatabase: {
    global: false,
    segmentDelimiter: '_',
    wordDelimiter: '_',
  },
  mskCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'kafka',
    arn: {
      service: 'kafka',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'cluster/',
    },
    permissions: {
      read: ['kafka:Describe*', 'kafka:List*', 'kafka:Get*'],
      readWrite: ['kafka:Describe*', 'kafka:List*', 'kafka:Get*', 'kafka:Update*'],
      manage: ['kafka:*', 'kafka-cluster:*'],
    },
  },

  // ── Operations / Governance ───────────────────────────────────────────────
  cloudFormationStack: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-stack',
  },
  configRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-rule',
  },
  configAggregator: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  wafWebAcl: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service'],
    suffix: '--waf',
    iamService: 'wafv2',
    arn: { service: 'wafv2', includeRegion: true, includeAccount: true, resourcePrefix: 'webacl/' },
    permissions: {
      read: ['wafv2:Get*', 'wafv2:List*', 'wafv2:Describe*'],
      readWrite: [
        'wafv2:Get*',
        'wafv2:List*',
        'wafv2:Describe*',
        'wafv2:Update*',
        'wafv2:Associate*',
        'wafv2:Disassociate*',
      ],
      manage: ['wafv2:*'],
    },
  },
  backupPlan: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  backupVault: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'backup',
    arn: {
      service: 'backup',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'backup-vault:',
    },
    permissions: {
      read: ['backup:Describe*', 'backup:List*', 'backup:Get*'],
      readWrite: [
        'backup:Describe*',
        'backup:List*',
        'backup:Get*',
        'backup:StartBackupJob',
        'backup:StartRestoreJob',
        'backup:Delete*',
      ],
      manage: ['backup:*'],
    },
  },
  xraySamplingRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  securityHubInsight: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── AppConfig ─────────────────────────────────────────────────────────────
  appConfigEnvironment: {
    // environment name only, e.g. 'prod', 'dev' — maps to the env segment
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['env'],
  },
  appConfigProfile: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-profile',
  },

  // ── Lambda ────────────────────────────────────────────────────────────────
  lambdaAlias: {
    // alias is the env value: 'prod', 'dev', 'staging'
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['env'],
  },

  // ── API Gateway ───────────────────────────────────────────────────────────
  apiGatewayStage: {
    // stage maps directly to env: 'prod', 'dev', 'staging'
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['env'],
  },

  // ── Systems Manager ───────────────────────────────────────────────────────
  ssmDocument: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ssmMaintenanceWindow: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-window',
  },

  // ── Service Catalog ───────────────────────────────────────────────────────
  serviceCatalogPortfolio: {
    // {org}--{domain}--portfolio
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
    suffix: '--portfolio',
  },
  serviceCatalogProduct: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-product',
  },

  // ── ElastiCache ───────────────────────────────────────────────────────────
  elastiCacheParameterGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--params',
  },

  // ── Redshift ──────────────────────────────────────────────────────────────
  redshiftSubnetGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--subnet-group',
  },

  // ── WAF ───────────────────────────────────────────────────────────────────
  wafIpSet: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--ipset',
  },
  wafRuleGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── QuickSight ────────────────────────────────────────────────────────────
  quickSightDataset: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--dataset',
  },
  quickSightAnalysis: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--analysis',
  },
  quickSightDashboard: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── AppSync ───────────────────────────────────────────────────────────────
  appSyncDataSource: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'target'],
  },
} satisfies Record<string, ResourceTypeConfig>

/** Union of all registered resource type keys. */
export type ResourceType = keyof typeof RESOURCE_TYPES
