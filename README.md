# derrops-conventions

TypeScript implementation of the [Derrops naming conventions](https://blog.slaops.com/blog/derrops-conventions) for AWS resources. The conventions are described in full in two blog posts:

- **[Derrops Guide to Naming Conventions and Segregation](https://blog.slaops.com/blog/derrops-conventions)** — the reasoning, principles, segment definitions, and delimiter decisions
- **[AWS Resource Naming Cheatsheet](https://blog.slaops.com/blog/derrops-naming-sheet)** — quick-reference patterns for every AWS service

This package encodes those rules into a fluent TypeScript builder so names are generated consistently, without manual string concatenation.

---

## Core concept

Every AWS resource name is built from an ordered set of segments:

```
{region} -- {env} -- {org} -- {tenant} -- {domain} -- {service} -- {key}
```

The delimiter and which segments are included vary by resource type. Globally unique services (S3 buckets) include `region` and `env`; account-scoped services omit them. Services with native hierarchy support (SSM, S3 object keys, IAM) use `/` instead of `--`. DNS records use a reversed hierarchy with `.`.

`DerropsConventions` encodes all of this — you supply segments, it applies the right rules per resource type.

---

## Installation

```bash
npm install @derrops-conventions
# or
pnpm add @derrops-conventions
```

---

## Quick start

```typescript
import { DerropsConventions } from '@derrops-conventions'

const naming = new DerropsConventions({
  region: 'ap-southeast-2',
  env: 'prod',
  org: 'acme',
  domain: 'payments',
  service: 'checkout-api',
})

// S3 bucket — globally unique, includes region + env
naming.name({ type: 's3Bucket', key: 'backups' })
// → 'ap-southeast-2--prod--acme--payments--checkout-api--backups'

// Lambda — account-scoped, omits region + env
naming.name({ type: 'lambdaFunction', key: 'webhook-handler' })
// → 'acme--payments--checkout-api--webhook-handler'

// SSM parameter — native path hierarchy with leading slash
naming.name({ type: 'ssmParam', key: 'stripe-webhook-secret' })
// → '/acme/payments/checkout-api/stripe-webhook-secret'

// CloudWatch metrics namespace — org/domain only (service goes into Dimensions)
naming.name({ type: 'cloudwatchMetricNamespace' })
// → 'acme/payments'

// Route53 record — reversed DNS hierarchy
naming.name({ type: 'route53Record', org: 'acme.com' })
// → 'checkout-api.prod.acme.com'

// Kafka topic — native dot hierarchy
naming.name({ type: 'kafkaTopic' })
// → 'acme.payments.checkout-api'
```

---

## Segment reference

| Segment     | Required?                           | Example                 | Description                                             |
| ----------- | ----------------------------------- | ----------------------- | ------------------------------------------------------- |
| `region`    | Globally unique resources only (S3) | `ap-southeast-2`        | AWS region code                                         |
| `env`       | Globally unique resources + DNS     | `prod`, `dev`           | Deployment environment; omit if account-segregated      |
| `org`       | Always                              | `acme`                  | Top-level organisational boundary                       |
| `tenant`    | Silo multi-tenancy only             | `t-a3f8b2`              | Opaque tenant ID — never a human-readable name          |
| `domain`    | Always                              | `payments`              | Bounded business capability                             |
| `service`   | Always                              | `checkout-api`          | Deployable service unit                                 |
| `partition` | Time-series data in S3 only         | `2024/01/15/14`         | Date/time partition (only segment that may contain `/`) |
| `key`       | Always                              | `stripe-webhook-secret` | Specific resource, config value, or filename            |

Stability decreases left to right — `org` and `domain` change almost never; `key` changes frequently. See the [conventions guide](https://blog.slaops.com/blog/derrops-conventions#segment-stability) for the full stability matrix.

---

## API

### `new DerropsConventions(defaults?)`

Creates a naming instance with optional default segment values. Any segment set here is used for all `name()` calls on this instance unless overridden at call time.

```typescript
const naming = new DerropsConventions({ org: 'acme', domain: 'payments' })
```

### `.name(options)`

Generates a resource name. `type` is always required (or set a default via `.with({ type })`). Any segment passed here overrides the instance default for that call.

```typescript
naming.name({ type: 'dynamoDb', service: 'checkout-api', key: 'transactions' })
// → 'acme--payments--checkout-api--transactions'
```

### `.with(overrides)`

Returns a new instance with additional defaults merged in. Pass `type` to set a default resource type — `name()` on the derived instance then makes `type` optional.

```typescript
const paymentsSsmNaming = naming.with({ service: 'checkout-api', type: 'ssmParam' })

paymentsSsmNaming.name({ key: 'stripe-key' })
// → '/acme/payments/checkout-api/stripe-key'

paymentsSsmNaming.name({ type: 'lambdaFunction', key: 'handler' })
// → 'acme--payments--checkout-api--handler'   (type overridden for this call)
```

Does not mutate the original instance.

### `.domain(values)` / `.service(values)` / `.key(values)` / etc.

Segment constraint helpers — narrow the accepted literal union for a segment at the TypeScript level. Passing an invalid value becomes a compile-time error.

```typescript
const naming = new DerropsConventions({ org: 'acme' })
  .domain(['payments', 'identity', 'platform'])
  .service(['checkout-api', 'auth-service'])

naming.name({ type: 'lambdaFunction', domain: 'payments', service: 'checkout-api', key: 'handler' })
// TypeScript error if domain or service is not in the allowed lists
```

Available helpers: `.region()`, `.env()`, `.org()`, `.tenant()`, `.domain()`, `.service()`, `.partition()`, `.key()`

### `.constrain(key, ...values)`

Variadic form of the segment helpers — useful when the value list is dynamic.

```typescript
const segments = ['payments', 'identity'] as const
const naming = new DerropsConventions({ org: 'acme' }).constrain('domain', ...segments)
```

### `.segmentOrder(...segments)`

Override the default segment ordering. Any segment not listed is excluded from generated names (unless the resource type defines its own fixed `segments` list).

```typescript
naming.segmentOrder('domain', 'org', 'service', 'key')
```

### `DerropsConventions.resourceTypes()`

Returns a sorted array of all registered resource type keys.

```typescript
DerropsConventions.resourceTypes()
// → ['acmCertificate', 'alb', 'apiGatewayHttpApi', ...]
```

### `DerropsConventions.registerResourceType(name, config)`

Register a custom resource type or override an existing one.

```typescript
DerropsConventions.registerResourceType('myQueue', {
  global: false,
  segmentDelimiter: '::',
  wordDelimiter: '-',
})
```

---

## Multi-tenancy (silo model)

Pass an opaque `tenant` ID to add tenant-scoped prefixes. See [the conventions guide](https://blog.slaops.com/blog/derrops-conventions#multi-tenancy) for the full decision matrix on tenant-first vs tenant-second-last placement and when to use the silo vs pool model.

```typescript
const tenantNaming = naming.with({ tenant: 't-a3f8b2' })

tenantNaming.name({ type: 'ssmParam', key: 'stripe-key' })
// → '/acme/t-a3f8b2/payments/checkout-api/stripe-key'

tenantNaming.name({ type: 's3Bucket', key: 'data' })
// → 'ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout-api--data'
```

**Always use an opaque ID, never a human-readable name.** Human-readable tenant names in globally unique namespaces (S3 buckets, CloudFront aliases) are squattable — a bad actor can pre-register `ap-southeast-2--prod--acme--bigcorp--data` before you onboard `bigcorp`. An opaque ID like `t-a3f8b2` is not guessable and remains stable even if a tenant rebrands.

---

## Resource types reference

| Type key                      | AWS resource               | Delimiter | Global? | Example output                                             |
| ----------------------------- | -------------------------- | --------- | ------- | ---------------------------------------------------------- |
| `s3Bucket`                    | S3 Bucket                  | `--`      | ✅      | `ap-southeast-2--prod--acme--payments--checkout-api--data` |
| `s3ObjectKey`                 | S3 Object Key              | `/`       | ❌      | `acme/payments/checkout-api/schema.sql`                    |
| `s3LogKey`                    | S3 Log/Event Key           | `/`       | ❌      | `acme/payments/checkout-api/2024/01/15/14/events.json`     |
| `cloudwatchLogsGroup`         | CloudWatch Log Group       | `/`       | ❌      | `/acme/payments/checkout-api/application-logs`             |
| `cloudwatchMetricNamespace`   | CloudWatch Metrics NS      | `/`       | ❌      | `acme/payments` _(org/domain only)_                        |
| `ecr`                         | ECR Repository             | `/`       | ❌      | `acme/payments/checkout-api`                               |
| `ecsCluster`                  | ECS Cluster                | `--`      | ❌      | `acme--payments--checkout-api--cluster`                    |
| `ecsService`                  | ECS Service                | `--`      | ❌      | `acme--payments--checkout-api`                             |
| `ecsTaskDefinition`           | ECS Task Definition        | `--`      | ❌      | `acme--payments--checkout-api`                             |
| `dynamoDb`                    | DynamoDB Table             | `--`      | ❌      | `acme--payments--checkout-api--transactions`               |
| `dynamoDbGsi`                 | DynamoDB GSI               | `--`      | ❌      | `acme--payments--checkout-api--gsi`                        |
| `rdsInstance`                 | RDS Instance               | `--`      | ❌      | `acme--payments--checkout-api--primary`                    |
| `rdsDbName`                   | RDS Database Name          | `_`       | ❌      | `acme_payments_checkout-api`                               |
| `rdsParameterGroup`           | RDS Parameter Group        | `--`      | ❌      | `acme--payments--checkout-api--params`                     |
| `rdsSubnetGroup`              | RDS Subnet Group           | `--`      | ❌      | `acme--payments--checkout-api--subnet-group`               |
| `rdsProxy`                    | RDS Proxy                  | `--`      | ❌      | `acme--payments--checkout-api--proxy`                      |
| `ec2Instance`                 | EC2 Instance               | `--`      | ❌      | `acme--payments--checkout-api--web-01`                     |
| `ec2SecurityGroup`            | EC2 Security Group         | `--`      | ❌      | `acme--payments--checkout-api--alb`                        |
| `ec2Volume`                   | EC2 Volume                 | `--`      | ❌      | `acme--payments--checkout-api--volume-data`                |
| `ec2ElasticIp`                | EC2 Elastic IP             | `--`      | ❌      | `acme--payments--checkout-api--eip`                        |
| `lambdaFunction`              | Lambda Function            | `--`      | ❌      | `acme--payments--checkout-api--webhook-handler`            |
| `lambdaLayer`                 | Lambda Layer               | `--`      | ❌      | `acme--shared-utilities--common-libs`                      |
| `autoScalingGroup`            | Auto Scaling Group         | `--`      | ❌      | `acme--payments--checkout-api--asg`                        |
| `launchTemplate`              | Launch Template            | `--`      | ❌      | `acme--payments--checkout-api--launch-template`            |
| `iamRole`                     | IAM Role (path)            | `/`       | ❌      | `/acme/payments/checkout-api/checkout-api--lambda-role`    |
| `iamPath`                     | IAM Path prefix            | `/`       | ❌      | `/acme/payments/checkout-api/`                             |
| `iamPolicy`                   | IAM Policy                 | `--`      | ❌      | `acme--payments--checkout-api--s3-access-policy`           |
| `iamUser`                     | IAM User                   | `--`      | ❌      | `acme--payments--checkout-api--service-user`               |
| `route53HostedZone`           | Route53 Hosted Zone        | `.`       | ✅      | `prod.acme.com`                                            |
| `route53Record`               | Route53 DNS Record         | `.`       | ✅      | `checkout-api.prod.acme.com`                               |
| `route53PrivateRecord`        | Route53 Private Record     | `.`       | ✅      | `checkout-api.prod.acme.com`                               |
| `cloudFrontDistribution`      | CloudFront Distribution    | `--`      | ❌      | `acme--payments--checkout-api--cdn`                        |
| `cloudFrontAlias`             | CloudFront Alias (CNAME)   | `.`       | ✅      | `checkout-api.prod.acme.com`                               |
| `acmCertificate`              | ACM Certificate            | `.`       | ✅      | `checkout-api.prod.acme.com`                               |
| `vpc`                         | VPC                        | `--`      | ❌      | `acme--payments--checkout-api--vpc`                        |
| `subnet`                      | Subnet                     | `--`      | ❌      | `acme--payments--checkout-api--subnet-private-1a`          |
| `routeTable`                  | Route Table                | `--`      | ❌      | `acme--payments--checkout-api--rt-private`                 |
| `networkAcl`                  | Network ACL                | `--`      | ❌      | `acme--payments--checkout-api--nacl`                       |
| `alb`                         | ALB / NLB                  | `--`      | ❌      | `acme--payments--checkout-api--alb`                        |
| `targetGroup`                 | Target Group               | `--`      | ❌      | `acme--payments--checkout-api--tg-api`                     |
| `snsTopic`                    | SNS Topic                  | `--`      | ❌      | `acme--payments--checkout-api--transactions`               |
| `sqsQueue`                    | SQS Queue                  | `--`      | ❌      | `acme--payments--checkout-api--events`                     |
| `sqsFifoQueue`                | SQS FIFO Queue             | `--`      | ❌      | `acme--payments--checkout-api--events.fifo`                |
| `sqsDlq`                      | SQS Dead-letter Queue      | `--`      | ❌      | `acme--payments--checkout-api--events--dlq`                |
| `kinesisStream`               | Kinesis Stream             | `--`      | ❌      | `acme--payments--checkout-api--events`                     |
| `eventBridgeBus`              | EventBridge Bus            | `--`      | ❌      | `acme--payments--checkout-api--events`                     |
| `eventBridgeRule`             | EventBridge Rule           | `--`      | ❌      | `acme--payments--checkout-api--process-webhook-rule`       |
| `kafkaTopic`                  | Kafka / MSK Topic          | `.`       | ❌      | `acme.payments.checkout-api.events`                        |
| `apiGatewayRestApi`           | API Gateway REST API       | `--`      | ❌      | `acme--payments--checkout-api--api`                        |
| `apiGatewayHttpApi`           | API Gateway HTTP API       | `--`      | ❌      | `acme--payments--checkout-api--http-api`                   |
| `apiGatewayKey`               | API Gateway Key            | `--`      | ❌      | `acme--payments--checkout-api--mobile-client`              |
| `appSyncApi`                  | AppSync API                | `--`      | ❌      | `acme--payments--checkout-api--api`                        |
| `stepFunctions`               | Step Functions             | `--`      | ❌      | `acme--payments--checkout-api--order-processing`           |
| `elastiCacheCluster`          | ElastiCache Cluster        | `--`      | ❌      | `acme--payments--checkout-api--cache`                      |
| `elastiCacheReplicationGroup` | ElastiCache Replication Gp | `--`      | ❌      | `acme--payments--checkout-api--replication-group`          |
| `openSearchDomain`            | OpenSearch Domain          | `--`      | ❌      | `acme--payments--checkout-api`                             |
| `openSearchIndex`             | OpenSearch Index           | `--`      | ❌      | `acme--payments` _(org/domain/entity)_                     |
| `ssmParam`                    | SSM Parameter              | `/`       | ❌      | `/acme/payments/checkout-api/stripe-webhook-secret`        |
| `secretsManager`              | Secrets Manager Secret     | `/`       | ❌      | `acme/payments/checkout-api/db-password`                   |
| `appConfigApplication`        | AppConfig Application      | `--`      | ❌      | `acme--payments--checkout-api`                             |
| `glueDatabase`                | Glue Database              | `_`       | ❌      | `acme_payments_checkout_api`                               |
| `glueJob`                     | Glue Job                   | `--`      | ❌      | `acme--analytics--etl--transform-job`                      |
| `glueCrawler`                 | Glue Crawler               | `--`      | ❌      | `acme--analytics--data-crawlers`                           |
| `athenaWorkgroup`             | Athena Workgroup           | `--`      | ❌      | `acme--analytics--etl--workgroup`                          |
| `redshiftCluster`             | Redshift Cluster           | `--`      | ❌      | `acme--analytics--warehouse--cluster`                      |
| `redshiftDatabase`            | Redshift Database          | `_`       | ❌      | `acme_analytics_warehouse`                                 |
| `mskCluster`                  | MSK Cluster                | `--`      | ❌      | `acme--events--streaming--cluster`                         |
| `cloudFormationStack`         | CloudFormation Stack       | `--`      | ❌      | `acme--payments--checkout-api--stack`                      |
| `configRule`                  | AWS Config Rule            | `--`      | ❌      | `acme--payments--checkout-api--encryption-enabled-rule`    |
| `configAggregator`            | Config Aggregator          | `--`      | ❌      | `acme--payments--config-aggregator`                        |
| `wafWebAcl`                   | WAF Web ACL                | `--`      | ❌      | `acme--payments--checkout-api--waf`                        |
| `backupPlan`                  | AWS Backup Plan            | `--`      | ❌      | `acme--payments--checkout-api--backup-plan`                |
| `backupVault`                 | AWS Backup Vault           | `--`      | ❌      | `acme--payments--checkout-api--vault`                      |
| `xraySamplingRule`            | X-Ray Sampling Rule        | `--`      | ❌      | `acme--payments--checkout-api--sampling-rule`              |
| `securityHubInsight`          | Security Hub Insight       | `--`      | ❌      | `acme--payments--checkout-api--critical-findings-insight`  |

---

## Delimiter logic

The package applies the delimiter decision matrix from the conventions guide automatically:

| Rule                                                                      | Delimiter |
| ------------------------------------------------------------------------- | --------- |
| **Segment separator** — between org, domain, service, key in flat names   | `--`      |
| **Word separator** — between words within a segment (e.g. `checkout-api`) | `-`       |
| **Native path hierarchy** — SSM, S3 keys, IAM paths, CloudWatch Logs, ECR | `/`       |
| **Native DNS hierarchy** — Route53, CloudFront aliases, ACM, Kafka topics | `.`       |
| **Database-internal names** — RDS database name, Glue database            | `_`       |

`global: true` resource types include `region` and `env` in the name; `global: false` types omit them because the AWS account provides namespace isolation.

---

## Further reading

- [Derrops Guide to Naming Conventions and Segregation](https://blog.slaops.com/blog/derrops-conventions) — principles, segment definitions, delimiter rationale, multi-tenancy placement decisions
- [AWS Resource Naming Cheatsheet](https://blog.slaops.com/blog/derrops-naming-sheet) — per-service patterns, examples, common pitfalls
