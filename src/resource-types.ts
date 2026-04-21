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
    suffix: '--gsi',
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
    suffix: '.fifo',
  },
  sqsDlq: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '--dlq',
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
    suffix: '-rule',
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
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'tenant', 'domain', 'entity'],
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
    suffix: '-job',
  },
  glueCrawler: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-crawler',
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
