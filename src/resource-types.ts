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
    consoleLabel: 's3',
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
  s3KeyPrefix: {
    // Path prefix within an S3 bucket: org/domain/service[/tenant][/partition]
    // Compose with s3ObjectName (append '/' + key value) to form a complete object key.
    // 'partition' carries multi-part date paths like '2024/03/15/14'.
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service', 'tenant', 'partition'] as const,
  },
  s3ObjectName: {
    // The filename component of an S3 key (the 'key' segment only).
    // segmentDelimiter '--' is never exercised (single segment) but must differ from wordDelimiter '-'.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['key'] as const,
  },

  // ── CloudWatch ───────────────────────────────────────────────────────────
  cloudwatchLogsGroup: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    iamService: 'logs',
    consoleLabel: 'cloudwatch-logs',
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
    // Namespace is org/domain only — service-level granularity belongs in Dimensions.
    // Use conventions.dimensions() to produce the CloudWatch Dimensions array
    // (Service, Environment, Tenant, etc.) alongside PutMetricData calls.
    // Not a direct IAM ARN target — CloudWatch metric policies use Resource: '*'.
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
    iamService: 'cloudwatch',
  },
  cloudwatchAlarm: {
    // CloudWatch alarm name: org--domain--service--key (key = metric descriptor, e.g. 'error-rate')
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'cloudwatch',
    consoleLabel: 'cloudwatch',
    arn: { service: 'cloudwatch', includeRegion: true, includeAccount: true, resourcePrefix: 'alarm:' },
    permissions: {
      read: ['cloudwatch:Describe*', 'cloudwatch:Get*', 'cloudwatch:List*'],
      readWrite: ['cloudwatch:Describe*', 'cloudwatch:Get*', 'cloudwatch:List*', 'cloudwatch:PutMetricAlarm', 'cloudwatch:DeleteAlarms', 'cloudwatch:SetAlarmState'],
      manage: ['cloudwatch:*'],
    },
  },
  cloudwatchCompositeAlarm: {
    // Composite alarm that aggregates multiple alarms for a service
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'cloudwatch',
    consoleLabel: 'cloudwatch',
    arn: { service: 'cloudwatch', includeRegion: true, includeAccount: true, resourcePrefix: 'alarm:' },
    permissions: {
      read: ['cloudwatch:Describe*', 'cloudwatch:Get*', 'cloudwatch:List*'],
      readWrite: ['cloudwatch:Describe*', 'cloudwatch:Get*', 'cloudwatch:List*', 'cloudwatch:PutCompositeAlarm', 'cloudwatch:DeleteAlarms'],
      manage: ['cloudwatch:*'],
    },
  },
  cloudwatchDashboard: {
    // CloudWatch dashboard name: org--domain--service (one dashboard per service by default)
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'cloudwatch',
    consoleLabel: 'cloudwatch',
    arn: { service: 'cloudwatch', includeRegion: false, includeAccount: false, resourcePrefix: 'dashboard/' },
    permissions: {
      read: ['cloudwatch:GetDashboard', 'cloudwatch:ListDashboards'],
      readWrite: ['cloudwatch:GetDashboard', 'cloudwatch:ListDashboards', 'cloudwatch:PutDashboard', 'cloudwatch:DeleteDashboards'],
      manage: ['cloudwatch:*'],
    },
  },
  cloudwatchLogMetricFilter: {
    // Log metric filter name tied to a log group and metric name
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'logs',
    // Log metric filters don't have their own ARN — they're sub-resources of a log group.
  },

  // ── ECR / ECS ────────────────────────────────────────────────────────────
  ecr: {
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    iamService: 'ecr',
    consoleLabel: 'ecr',
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
    consoleLabel: 'ecs-cluster',
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
    consoleLabel: 'ecs-service',
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
    consoleLabel: 'ecs-task',
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

  // ── EKS / Kubernetes ─────────────────────────────────────────────────────
  eksCluster: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'eks',
    consoleLabel: 'eks',
    arn: { service: 'eks', includeRegion: true, includeAccount: true, resourcePrefix: 'cluster/' },
    permissions: {
      read: ['eks:Describe*', 'eks:List*', 'eks:AccessKubernetesApi'],
      readWrite: ['eks:Describe*', 'eks:List*', 'eks:AccessKubernetesApi', 'eks:UpdateClusterConfig', 'eks:UpdateClusterVersion'],
      manage: ['eks:*'],
    },
  },
  eksNodeGroup: {
    // Managed node group: org--domain--service--purpose
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'eks',
    arn: { service: 'eks', includeRegion: true, includeAccount: true, resourcePrefix: 'nodegroup/' },
    permissions: {
      read: ['eks:Describe*', 'eks:List*'],
      readWrite: ['eks:Describe*', 'eks:List*', 'eks:UpdateNodegroupConfig', 'eks:UpdateNodegroupVersion'],
      manage: ['eks:*'],
    },
  },
  eksFargateProfile: {
    // Fargate profile: org--domain--service--purpose
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'eks',
    arn: { service: 'eks', includeRegion: true, includeAccount: true, resourcePrefix: 'fargateprofile/' },
    permissions: {
      read: ['eks:Describe*', 'eks:List*'],
      readWrite: ['eks:Describe*', 'eks:List*', 'eks:CreateFargateProfile', 'eks:DeleteFargateProfile'],
      manage: ['eks:*'],
    },
  },
  eksAddon: {
    // EKS add-on (e.g. vpc-cni, coredns): org--domain--service--key
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'eks',
    arn: { service: 'eks', includeRegion: true, includeAccount: true, resourcePrefix: 'addon/' },
    permissions: {
      read: ['eks:Describe*', 'eks:List*'],
      readWrite: ['eks:Describe*', 'eks:List*', 'eks:CreateAddon', 'eks:DeleteAddon', 'eks:UpdateAddon'],
      manage: ['eks:*'],
    },
  },
  k8sNamespace: {
    // Kubernetes namespace — maps to the domain segment (DNS-label safe: lowercase + hyphens, max 63 chars)
    global: false,
    segmentDelimiter: '-',
    wordDelimiter: '-',
    segments: ['domain'],
  },
  k8sDeployment: {
    // Kubernetes Deployment name — maps to service segment
    global: false,
    segmentDelimiter: '-',
    wordDelimiter: '-',
    segments: ['service'],
  },
  k8sService: {
    // Kubernetes Service name — maps to service segment
    global: false,
    segmentDelimiter: '-',
    wordDelimiter: '-',
    segments: ['service'],
  },
  k8sConfigMap: {
    // Kubernetes ConfigMap name — service--key
    global: false,
    segmentDelimiter: '-',
    wordDelimiter: '-',
    segments: ['service', 'key'],
  },
  k8sSecret: {
    // Kubernetes Secret name — service--key
    global: false,
    segmentDelimiter: '-',
    wordDelimiter: '-',
    segments: ['service', 'key'],
  },

  // ── Databases ────────────────────────────────────────────────────────────
  dynamoDb: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'dynamodb',
    consoleLabel: 'dynamodb',
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
    consoleLabel: 'dynamodb-gsi',
    // stripSuffix removes '--gsi' before ARN construction so the ARN targets the parent table.
    // resourceSuffix '/index/*' grants access to all indexes on that table.
    arn: {
      service: 'dynamodb',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'table/',
      resourceSuffix: '/index/*',
      stripSuffix: '--gsi',
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
    consoleLabel: 'rds',
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
    consoleLabel: 'rds-param-group',
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
    consoleLabel: 'rds-subnet-group',
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
    consoleLabel: 'rds-proxy',
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
    consoleLabel: 'lambda',
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
    consoleLabel: 'lambda-layer',
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
    consoleLabel: 'iam-role',
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
    consoleLabel: 'iam-policy',
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
    consoleLabel: 'iam-user',
    arn: { service: 'iam', includeRegion: false, includeAccount: true, resourcePrefix: 'user/' },
    permissions: {
      read: ['iam:Get*', 'iam:List*'],
      readWrite: ['iam:Get*', 'iam:List*', 'iam:Update*', 'iam:Create*', 'iam:Delete*'],
      manage: ['iam:*'],
    },
  },
  iamPath: {
    // path prefix for organising roles/users: /{org}/{domain}/{service}/
    // AWS requires IAM paths to start AND end with '/'; suffix adds the trailing slash.
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    suffix: '/',
  },

  // ── DNS / Route53 / CloudFront / ACM ─────────────────────────────────────
  // apex encodes the effective zone for this deployment (e.g. 'dev.acme.com' or 'acme.com').
  // Use .apexMapping() on the convention instance to derive it from env at naming time.
  //
  // Three subdomain patterns are supported:
  //   service-first  — route53Record / route53PrivateRecord / cloudFrontAlias / acmCertificate
  //                    {service}.{zone}         e.g. checkout-api.dev.acme.com
  //   tenant-first   — route53TenantRecord / route53TenantPrivateRecord / cloudFrontTenantAlias / acmCertificateTenant
  //                    {tenant}.{service}.{zone} e.g. acme-corp.checkout-api.dev.acme.com
  //   zone apex (@)  — route53ApexRecord         just the zone itself, for root A/AAAA records
  //   wildcard       — route53WildcardRecord / cloudFrontWildcardAlias
  //                    *.{zone}                  e.g. *.dev.acme.com
  route53HostedZone: {
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['apex'],
  },
  route53Record: {
    // service.{effective-apex} — e.g. checkout-api.dev.acme.com or checkout-api.acme.com
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'apex'],
  },
  route53PrivateRecord: {
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'apex'],
  },
  route53ApexRecord: {
    // Zone apex (@) record — the domain itself with no service prefix.
    // Use for root A/AAAA records: e.g. 'dev.acme.com' → 54.x.x.x.
    // Identical to route53HostedZone in output; semantically it names a record, not the zone.
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['apex'],
  },
  route53WildcardRecord: {
    // Wildcard record covering all unmatched subdomains: *.{effective-apex}
    // e.g. with apexMapping(s => `${s.env}.${s.apex}`) → '*.dev.acme.com'
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['apex'],
    namePrefix: '*.',
  },
  route53TenantRecord: {
    // Tenant-first subdomain: {tenant}.{service}.{effective-apex}
    // e.g. acme-corp.checkout-api.dev.acme.com
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['tenant', 'service', 'apex'],
  },
  route53TenantPrivateRecord: {
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['tenant', 'service', 'apex'],
  },
  cloudFrontDistribution: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'cloudfront',
    consoleLabel: 'cloudfront',
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
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'apex'],
  },
  cloudFrontWildcardAlias: {
    // Wildcard CloudFront alias: *.{effective-apex}
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['apex'],
    namePrefix: '*.',
  },
  cloudFrontTenantAlias: {
    // Tenant-first CloudFront alias: {tenant}.{service}.{effective-apex}
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['tenant', 'service', 'apex'],
  },
  acmCertificate: {
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['service', 'apex'],
  },
  acmCertificateTenant: {
    // Tenant-first ACM certificate: {tenant}.{service}.{effective-apex}
    global: false,
    segmentDelimiter: '.',
    wordDelimiter: '-',
    segments: ['tenant', 'service', 'apex'],
  },

  // ── Networking — boundary-aligned naming ─────────────────────────────────
  // VPC = org boundary      → vpc:         segments ['org']
  // Subnet = domain tier    → subnet:      segments ['org', 'domain', 'kind', 'az']
  // NACL = domain guard     → networkAcl:  segments ['org', 'domain']
  // SG = service access     → ec2SecurityGroup: segments ['org', 'domain', 'service', 'purpose']
  //
  // Cross-boundary:
  //   vpcPeering            → ['org', 'target']           (target = remote org name)
  //   transitGateway        → ['org']                     (org hub)
  //   transitGatewayAttachment → ['org', 'domain']        (domain attaches to org TGW)
  //   vpcEndpoint           → ['org', 'domain', 'service'] (service = AWS service name)
  vpc: {
    // Org boundary — one VPC per org per account. Provisioned once.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org'],
  },
  subnet: {
    // Domain boundary — one subnet group per domain per tier (private/public/isolated) per AZ.
    // 'service' is intentionally absent: subnets are domain-scoped, not service-scoped.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'kind', 'az'],
  },
  routeTable: {
    // Domain + tier — one route table per subnet kind per domain.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'kind'],
  },
  networkAcl: {
    // Domain boundary control — enforces inter-domain traffic rules at the subnet boundary.
    // 'service' is intentionally absent: NACLs are domain-scoped, not service-scoped.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
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
  transitGateway: {
    // Org-level network hub — connects all domain VPCs and cross-org peers.
    // Use TGW (hub-and-spoke) over VPC peering when connecting 3+ orgs.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org'],
    suffix: '--tgw',
  },
  transitGatewayAttachment: {
    // Domain VPC attachment to the org Transit Gateway.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
    suffix: '--tgw-attach',
  },
  vpcPeering: {
    // Cross-org VPC peering connection. 'target' = the remote org name.
    // Use for point-to-point two-org scenarios; prefer TGW for 3+ orgs.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'target'],
    suffix: '--peer',
  },
  vpcEndpoint: {
    // VPC Interface or Gateway endpoint for an AWS service inside a domain.
    // 'service' here is the AWS service name (e.g. 's3', 'dynamodb', 'ecr-api'),
    // not an application service name.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'service'],
    suffix: '--endpoint',
  },
  clientVpnEndpoint: {
    // AWS Client VPN endpoint — one shared endpoint per org per region.
    // All users share the same endpoint SG. Per-group access is controlled
    // exclusively via Client VPN Authorization Rules (AD/Cognito group → CIDR).
    //
    // Resource-level differentiation (OpenSearch vs RDS) is achieved by placing
    // each resource type in a different domain's subnet — each domain has its own
    // CIDR block, so authorization rules can target them independently:
    //   engineers: CIDR of acme--platform--isolated  (OpenSearch)
    //              + CIDR of acme--payments--isolated (RDS)
    //   search-only: CIDR of acme--platform--isolated only
    //
    // Use the authorization rule description field to reference the subnet name
    // (from the convention) rather than the raw CIDR, so audit logs are readable.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain'],
    suffix: '--client-vpn',
  },

  // ── Messaging ────────────────────────────────────────────────────────────
  snsTopic: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    iamService: 'sns',
    consoleLabel: 'sns',
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
    consoleLabel: 'sqs',
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
    consoleLabel: 'sqs-fifo',
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
    consoleLabel: 'sqs-dlq',
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
    consoleLabel: 'kinesis',
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
    consoleLabel: 'eventbridge',
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
    consoleLabel: 'eventbridge-rule',
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
  // execute-api ARNs encode the auto-generated API ID, not the API name — no arn/permissions here.
  // Use additionalStatements with resource '*' or the CDK-provided ARN for invoke grants.
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
    iamService: 'states',
    consoleLabel: 'sfn',
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
    consoleLabel: 'elasticache',
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
    consoleLabel: 'elasticache-rg',
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
    consoleLabel: 'opensearch',
    // policyResourceSuffix emits both domain ARN and domain/* so HTTP index actions are covered.
    arn: {
      service: 'es',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'domain/',
      policyResourceSuffix: '/*',
    },
    permissions: {
      read: ['es:Describe*', 'es:List*', 'es:ESHttpGet', 'es:ESHttpHead'],
      readWrite: ['es:Describe*', 'es:List*', 'es:ESHttp*'],
      manage: ['es:*'],
    },
  },
  openSearchIndex: {
    // Index name is org/domain/entity — intentionally NOT service.
    // An entity (e.g. 'transactions', 'users') lives at the domain level, not within a
    // specific service. Multiple services that produce or consume the same entity type
    // share the same index — this is by design. Use 'entity' to identify the document
    // type and 'tenant' to shard by tenant in a multi-tenant deployment.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    segments: ['org', 'domain', 'entity', 'tenant'],
  },

  // ── KMS ──────────────────────────────────────────────────────────────────
  kmsAlias: {
    // KMS key alias — name() returns 'org/domain/service/key'; alias ARN adds the 'alias/' prefix.
    // Use .resource() to obtain the ARN for IAM policy grants.
    // Alias display name (for --key-id flag): prepend 'alias/' to the name() result.
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    iamService: 'kms',
    consoleLabel: 'kms',
    arn: { service: 'kms', includeRegion: true, includeAccount: true, resourcePrefix: 'alias/' },
    permissions: {
      read: ['kms:Decrypt', 'kms:GenerateDataKey', 'kms:GenerateDataKeyWithoutPlaintext', 'kms:DescribeKey'],
      readWrite: [
        'kms:Decrypt',
        'kms:Encrypt',
        'kms:GenerateDataKey',
        'kms:GenerateDataKeyWithoutPlaintext',
        'kms:ReEncrypt*',
        'kms:DescribeKey',
      ],
      manage: ['kms:*'],
    },
  },
  kmsKey: {
    // Descriptive name/tag for a KMS key — used in key metadata and CDK resource IDs.
    // KMS key ARNs use a UUID key-id, not a derivable name; use kmsAlias for policy grants.
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
  },

  // ── Config / Secrets ─────────────────────────────────────────────────────
  ssmParam: {
    // leading '/' from name acts as separator after 'parameter' in the ARN
    global: false,
    segmentDelimiter: '/',
    wordDelimiter: '-',
    leadingDelimiter: true,
    iamService: 'ssm',
    consoleLabel: 'ssm',
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
    consoleLabel: 'secretsmanager',
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
    consoleLabel: 'appconfig',
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
    consoleLabel: 'glue',
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
    consoleLabel: 'glue-job',
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
    consoleLabel: 'glue-crawler',
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
    consoleLabel: 'athena',
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
    iamService: 'redshift',
    consoleLabel: 'redshift',
    arn: {
      service: 'redshift',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'cluster:',
    },
    permissions: {
      read: ['redshift:Describe*', 'redshift:List*', 'redshift:GetClusterCredentials'],
      readWrite: [
        'redshift:Describe*',
        'redshift:List*',
        'redshift:GetClusterCredentials',
        'redshift-data:ExecuteStatement',
        'redshift-data:BatchExecuteStatement',
        'redshift-data:DescribeStatement',
        'redshift-data:GetStatementResult',
      ],
      manage: ['redshift:*', 'redshift-data:*'],
    },
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
    consoleLabel: 'msk',
    arn: {
      service: 'kafka',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'cluster/',
    },
    permissions: {
      read: ['kafka:Describe*', 'kafka:List*', 'kafka:Get*'],
      // kafka-cluster:* covers data-plane produce/consume (Connect, ReadData, WriteData, etc.)
      readWrite: [
        'kafka:Describe*',
        'kafka:List*',
        'kafka:Get*',
        'kafka:Update*',
        'kafka-cluster:Connect',
        'kafka-cluster:DescribeCluster',
        'kafka-cluster:ReadData',
        'kafka-cluster:WriteData',
        'kafka-cluster:AlterCluster',
      ],
      manage: ['kafka:*', 'kafka-cluster:*'],
    },
  },

  // ── Operations / Governance ───────────────────────────────────────────────
  cloudFormationStack: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-stack',
    iamService: 'cloudformation',
    consoleLabel: 'cloudformation',
    // resourceSuffix '/*' matches all stack instances (stack ARNs include a generated UUID).
    arn: {
      service: 'cloudformation',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'stack/',
      resourceSuffix: '/*',
    },
    permissions: {
      read: ['cloudformation:Describe*', 'cloudformation:Get*', 'cloudformation:List*'],
      readWrite: [
        'cloudformation:Describe*',
        'cloudformation:Get*',
        'cloudformation:List*',
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DeleteStack',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:CreateChangeSet',
        'cloudformation:DeleteChangeSet',
      ],
      manage: ['cloudformation:*'],
    },
  },
  configRule: {
    global: false,
    segmentDelimiter: '--',
    wordDelimiter: '-',
    suffix: '-rule',
    iamService: 'config',
    consoleLabel: 'config',
    arn: {
      service: 'config',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'config-rule/',
    },
    permissions: {
      read: ['config:Describe*', 'config:Get*', 'config:List*'],
      readWrite: [
        'config:Describe*',
        'config:Get*',
        'config:List*',
        'config:PutConfigRule',
        'config:DeleteConfigRule',
        'config:StartConfigRulesEvaluation',
      ],
      manage: ['config:*'],
    },
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
    consoleLabel: 'waf',
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
    consoleLabel: 'backup-vault',
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
    iamService: 'xray',
    consoleLabel: 'xray',
    arn: {
      service: 'xray',
      includeRegion: true,
      includeAccount: true,
      resourcePrefix: 'sampling-rule/',
    },
    permissions: {
      read: [
        'xray:GetSamplingRules',
        'xray:GetSamplingStatisticSummaries',
        'xray:GetSamplingTargets',
      ],
      readWrite: [
        'xray:GetSamplingRules',
        'xray:GetSamplingStatisticSummaries',
        'xray:GetSamplingTargets',
        'xray:UpdateSamplingRule',
      ],
      manage: ['xray:*'],
    },
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
    iamService: 'ssm',
    consoleLabel: 'ssm-document',
    arn: { service: 'ssm', includeRegion: true, includeAccount: true, resourcePrefix: 'document/' },
    permissions: {
      read: ['ssm:GetDocument', 'ssm:DescribeDocument', 'ssm:ListDocuments'],
      readWrite: [
        'ssm:GetDocument',
        'ssm:DescribeDocument',
        'ssm:ListDocuments',
        'ssm:UpdateDocument',
        'ssm:SendCommand',
      ],
      manage: ['ssm:*'],
    },
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
