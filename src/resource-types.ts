import type { ResourceTypeConfig } from './types.js'

/**
 * All supported AWS resource types with their naming configuration.
 *
 * global: true  → name includes region + env (globally unique namespace)
 * global: false → name omits region + env (account provides namespace isolation)
 *
 * segments: explicit ordered list overrides the global/instance-order logic.
 * Used for DNS types (reversed hierarchy) and types with fixed segment subsets.
 */
export const RESOURCE_TYPES = {
  // ── S3 ───────────────────────────────────────────────────────────────────
  s3Bucket: {
    global: true,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },
  cloudwatchMetricNamespace: {
    // namespace is org/domain only; service goes into Dimensions
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
  },

  // ── ECR / ECS ────────────────────────────────────────────────────────────
  ecr: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
  },
  ecsCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ecsService: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ecsTaskDefinition: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── Databases ────────────────────────────────────────────────────────────
  dynamoDb: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  dynamoDbGsi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  rdsInstance: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },
  rdsSubnetGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  rdsProxy: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── Compute ──────────────────────────────────────────────────────────────
  ec2Instance: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ec2SecurityGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ec2Volume: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  ec2ElasticIp: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  lambdaFunction: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  lambdaLayer: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  autoScalingGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  launchTemplate: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── IAM ──────────────────────────────────────────────────────────────────
  iamRole: {
    // generates the IAM path: /{org}/{domain}/{service}/{key}
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
  },
  iamPolicy: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  iamUser: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },

  // ── Messaging ────────────────────────────────────────────────────────────
  snsTopic: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  sqsQueue: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  sqsFifoQueue: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  sqsDlq: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  kinesisStream: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  eventBridgeBus: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  eventBridgeRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },
  apiGatewayHttpApi: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  apiGatewayKey: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },

  // ── Caching / Search ─────────────────────────────────────────────────────
  elastiCacheCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  elastiCacheReplicationGroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  openSearchDomain: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  openSearchIndex: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
  },

  // ── Config / Secrets ─────────────────────────────────────────────────────
  ssmParam: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
  },
  secretsManager: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
  },
  appConfigApplication: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── Data / Analytics ─────────────────────────────────────────────────────
  glueDatabase: {
    global: false,
    segmentDelimiter: '_',
    wordDelimiter: '_',
  },
  glueJob: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  glueCrawler: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  athenaWorkgroup: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
  },

  // ── Operations / Governance ───────────────────────────────────────────────
  cloudFormationStack: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },
  configRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
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
} satisfies Record<string, ResourceTypeConfig>

/** Union of all registered resource type keys. */
export type ResourceType = keyof typeof RESOURCE_TYPES
