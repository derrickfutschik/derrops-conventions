# derrops-conventions

TypeScript implementation of the [Derrops naming conventions](https://blog.slaops.com/blog/derrops-conventions) for AWS resources. The conventions are described in full in two blog posts:

- **[Derrops Guide to Naming Conventions and Segregation](https://blog.slaops.com/blog/derrops-conventions)** — the reasoning, principles, segment definitions, and delimiter decisions
- **[AWS Resource Naming Cheatsheet](https://blog.slaops.com/blog/derrops-naming-sheet)** — quick-reference patterns for every AWS service

This package encodes those rules into a fluent TypeScript builder so names are generated consistently, without manual string concatenation.

---

## Core concept

Every AWS resource name is built from an ordered set of segments:

```
{region} -- {env} -- {org} -- {domain} -- {service} -- {tenant} -- {key}
```

The delimiter and which segments are included vary by resource type. Globally unique services (S3 buckets) include `region` and `env`; account-scoped services omit them. Services with native hierarchy support (SSM, S3 object keys, IAM) use `/` instead of `--`. DNS records use a reversed hierarchy with `.`.

Some resource types also append a fixed suffix after all segments — for example, SQS FIFO queues require `.fifo`, DynamoDB GSIs end in `--gsi`. The library handles all of this automatically.

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

// CloudWatch metrics namespace — org/domain only; service + env go into Dimensions
naming.name({ type: 'cloudwatchMetricNamespace' })
// → 'acme/payments'

// CloudWatch Dimensions — ready to pass to PutMetricData
naming.dimensions()
// → [{ Name: 'Service', Value: 'checkout-api' }]

naming.dimensionKeys('service', 'environment').dimensions()
// → [{ Name: 'Service', Value: 'checkout-api' }, { Name: 'Environment', Value: 'prod' }]

// Route53 record — service-first subdomain
naming.name({ type: 'route53Record', apex: 'dev.acme.com' })
// → 'checkout-api.dev.acme.com'

// Route53 tenant record — tenant outermost label
naming.with({ tenant: 't-a3f8b2' }).name({ type: 'route53TenantRecord', apex: 'dev.acme.com' })
// → 't-a3f8b2.checkout-api.dev.acme.com'

// Wildcard record
naming.name({ type: 'route53WildcardRecord', apex: 'dev.acme.com' })
// → '*.dev.acme.com'

// Zone apex (@) record — root A/AAAA record, no service prefix
naming.name({ type: 'route53ApexRecord', apex: 'dev.acme.com' })
// → 'dev.acme.com'

// SQS FIFO queue — .fifo suffix appended automatically
naming.name({ type: 'sqsFifoQueue', key: 'events' })
// → 'acme--payments--checkout-api--events.fifo'

// DynamoDB GSI — --gsi suffix appended automatically
naming.name({ type: 'dynamoDbGsi', key: 'by-user' })
// → 'acme--payments--checkout-api--by-user--gsi'

// Subnet — kind (private/public) and AZ segments
naming.name({ type: 'subnet', kind: 'private', az: '1a' })
// → 'acme--payments--checkout-api--private--1a'
```

---

## Segment reference

| Segment     | Used in                                 | Example                 | Description                                                                                                                                                        |
| ----------- | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `region`    | Globally unique resources (S3)          | `ap-southeast-2`        | AWS region code                                                                                                                                                    |
| `env`       | Globally unique resources + DNS         | `prod`, `dev`           | Deployment environment; omit if account-segregated                                                                                                                 |
| `org`       | All resources                           | `acme`                  | Top-level organisational boundary                                                                                                                                  |
| `domain`    | All resources                           | `payments`              | Bounded business capability                                                                                                                                        |
| `service`   | Most resources                          | `checkout-api`          | Deployable service unit                                                                                                                                            |
| `tenant`    | Silo multi-tenancy only                 | `t-a3f8b2`              | Opaque tenant ID — provisioned at runtime; never a human-readable name                                                                                             |
| `entity`    | OpenSearch indexes only                 | `transactions`          | Data entity within a domain. **Only appears in types that declare it explicitly** (currently `openSearchIndex`). Passing `entity` to any other type has no effect. |
| `partition` | Time-series S3 data                     | `2024/01/15/14`         | Date/time partition path (only segment that may contain `/`)                                                                                                       |
| `key`       | Most resources                          | `stripe-webhook-secret` | Specific resource, config value, or filename                                                                                                                       |
| `purpose`   | Security groups, volumes, target groups | `web`, `db`             | Functional role of a resource within its service                                                                                                                   |
| `kind`      | Subnets, EC2 instances                  | `private`, `public`     | Sub-classification — e.g. subnet visibility, EC2 instance role                                                                                                     |
| `az`        | Subnets                                 | `1a`, `1b`, `1c`        | Availability zone suffix for per-AZ resources                                                                                                                      |
| `num`       | EC2 instances                           | `01`, `02`, `03`        | Ordinal instance number when multiple instances share the same role                                                                                                |
| `consumer`  | API Gateway keys                        | `partner-a`             | Consuming service or external principal                                                                                                                            |
| `target`    | AppSync data sources                    | `user-table`            | Target resource or data source                                                                                                                                     |
| `version`   | ECR image tags                          | `1.2.3`, `latest`       | Version identifier — use with a custom `segmentOrder` for ECR                                                                                                      |

Stability decreases left to right — `org` and `domain` change almost never; `key` changes frequently.

`tenant` sits between `service` and `key` in the default order, not near the left. The key distinction: `org`, `domain`, and `service` are all known at system design time — they are defined when you write your CDK stacks and IAM policies. `tenant` is provisioned at runtime, per customer. The namespace of possible tenant values is volatile in a way that no other segment is. Placing runtime-provisioned segments to the right of design-time segments follows the stability principle and keeps prefix patterns predictable for cross-tenant access patterns (e.g. SSM prefix queries scoped to `/acme/payments/checkout-api/*`).

Tenant isolation is enforced via tag-based IAM conditions (`aws:ResourceTag/tenant`) rather than naming position — see [Tag-Based Tenant Isolation (ABAC)](https://blog.slaops.com/blog/derrops-conventions#tag-based-tenant-isolation-abac) for the full pattern.

See the [conventions guide](https://blog.slaops.com/blog/derrops-conventions#segment-stability) for the full stability matrix.

---

## API

### `new DerropsConventions(defaults?)`

Creates a naming instance with optional default segment values. Any segment set here is used for all `name()` and `tags()` calls on this instance unless overridden at call time.

```typescript
const naming = new DerropsConventions({ org: 'acme', domain: 'payments' })
```

### `.name(options)`

Generates a resource name. `type` is always required (or set a default via `.with({ type })`). Any segment passed here overrides the instance default for that call.

```typescript
naming.name({ type: 'dynamoDb', service: 'checkout-api', key: 'transactions' })
// → 'acme--payments--checkout-api--transactions'
```

For resource types with a fixed suffix (`.fifo`, `--gsi`, `--dlq`, etc.) the suffix is appended automatically — no manual string concatenation needed.

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

### `.constrain(key, ...values)`

Narrows the accepted literal union for a segment at the TypeScript level. Passing a value not in the list becomes a compile-time error. No runtime validation is performed.

```typescript
const segments = ['payments', 'identity'] as const
const naming = new DerropsConventions({ org: 'acme' }).constrain('domain', ...segments)
```

### Segment constraint helpers

Typed wrappers around `.constrain()` for each segment. Each returns a more-specific instance type so TypeScript enforces the allowed values.

```typescript
const naming = new DerropsConventions({ org: 'acme' })
  .domain(['payments', 'identity', 'platform'])
  .service(['checkout-api', 'auth-service'])
  .kind(['private', 'public'])
  .az(['1a', '1b', '1c'])

// TypeScript error if domain, service, kind, or az is not in the allowed list
naming.name({
  type: 'subnet',
  domain: 'payments',
  service: 'checkout-api',
  kind: 'private',
  az: '1a',
})
```

Available helpers: `.region()`, `.env()`, `.org()`, `.tenant()`, `.domain()`, `.service()`, `.partition()`, `.key()`, `.purpose()`, `.kind()`, `.az()`, `.num()`, `.consumer()`, `.target()`, `.version()`

### `.segmentOrder(...segments)`

Override the default segment ordering. Any segment not listed is excluded from generated names (unless the resource type defines its own fixed `segments` list).

```typescript
naming.segmentOrder('domain', 'org', 'service', 'key')
```

### `.arnContext(context)`

Store the AWS account ID (and optional partition) on the instance for ARN construction. Used by `.staticPolicy()` and `.dynamicPolicy()` when no explicit context is passed. Region is sourced from the `region` segment.

Chainable — returns `this`. Propagates to instances derived via `.with()`.

```typescript
const conventions = new DerropsConventions({ org: 'acme', region: 'us-east-1' })
  .arnContext({ accountId: '123456789012' })
  .arnContext({ accountId: '123456789012', partition: 'aws-cn' }) // optional partition override
```

### `.staticPolicy(context?)`

Returns a `StaticPolicyBuilder` for declarative IAM policy generation. See [IAM policy generation — static mode](#static-mode).

```typescript
const doc = conventions
  .staticPolicy()
  .include('s3Bucket', { key: 'uploads' }, { permissions: 'read' })
  .buildPolicy()
```

### `.dynamicPolicy(context?)`

Returns a `DynamicPolicySession` that intercepts `.name()` calls. See [IAM policy generation — dynamic mode](#dynamic-mode).

```typescript
const session = conventions.dynamicPolicy()
const bucket = session.name({ type: 's3Bucket', key: 'uploads' }, { permissions: 'read' })
const doc = session.buildPolicy()
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

## Tagging

`tags()` generates the standard resource tags alongside names. The full pipeline for each `tags()` call:

```
instance defaults + call overrides
        ↓
  built-in segment tags   (domain, service, org, environment — filtered by tagKeys())
        ↓
     tagRule()            (computed from segments — e.g. sensitivity flags, cost codes)
        ↓
     tagAugment()         (computed from accumulated tags — e.g. timestamps, composites)
        ↓
  limit validation        (keyMax, valueMax, maxTags)
        ↓
     policy()             (custom predicates — throw if false)
        ↓
      return tags
```

`tagRule()` and `tagAugment()` output is written **as-is** — `tagPrefix()` and `tagKeyCasing()` do **not** apply to rule- or augmentor-generated keys. The caller controls the exact key format for custom tags.

### `.tags(overrides?)`

Returns the tag dict. Segment overrides work the same as in `name()`.

```typescript
naming.tags()
// → { domain: 'payments', service: 'checkout-api' }

naming.tags({ service: 'auth-service' })
// → { domain: 'payments', service: 'auth-service' }
```

### `.applyTags(fn, overrides?)`

Calls `fn(key, value)` for every tag produced by `tags()`. Use this instead of a manual loop when applying tags through an external API that expects a setter callback.

```typescript
// AWS CDK — one line instead of a for..of loop
svcConvention.applyTags((k, v) => Tags.of(this).add(k, v))

// With segment overrides
svcConvention.applyTags((k, v) => Tags.of(this).add(k, v), { service: 'override' })
```

### `.tagKeys(...keys)`

Set which built-in tag keys appear in `tags()` output. Defaults to `['domain', 'service']` — `org` and `environment` are hidden by default because account-segregated deployments already provide that context.

```typescript
naming.tagKeys('org', 'domain', 'service', 'environment').tags()
// → { org: 'acme', domain: 'payments', service: 'checkout-api', environment: 'prod' }
```

### `.tagPrefix(prefix)`

Prepend a string to every built-in tag key. Include the separator you want (e.g. `'slaops:'`, `'my-app/'`, `'MyApp_'`). Applied after `tagKeyCasing()`.

```typescript
naming.tagPrefix('slaops:').tags()
// → { 'slaops:domain': 'payments', 'slaops:service': 'checkout-api' }
```

### `.tagKeyCasing(casing)`

Set the casing applied to built-in tag keys before they are written. Defaults to `'kebab'`.

| Casing   | `environment` | multi-word key `cost-center` |
| -------- | ------------- | ---------------------------- |
| `kebab`  | `environment` | `cost-center`                |
| `camel`  | `environment` | `costCenter`                 |
| `snake`  | `environment` | `cost_center`                |
| `pascal` | `Environment` | `CostCenter`                 |

```typescript
naming.tagKeyCasing('pascal').tagPrefix('MyApp_').tags()
// → { 'MyApp_Domain': 'payments', 'MyApp_Service': 'checkout-api' }
```

---

## CloudWatch Dimensions

CloudWatch metrics use a two-level addressing scheme: a **namespace** (coarse, org/domain) and **Dimensions** (fine, per-metric distinguishers like service, environment, or tenant). The convention maps directly to this:

```typescript
const naming = new DerropsConventions({
  org: 'acme',
  domain: 'payments',
  service: 'checkout-api',
  env: 'prod',
})

// Namespace — one per domain, not per service
naming.name({ type: 'cloudwatchMetricNamespace' })
// → 'acme/payments'

// Dimensions — uniquely identify the metric series within that namespace
naming.dimensions()
// → [{ Name: 'Service', Value: 'checkout-api' }]
```

Pass dimensions directly to the AWS SDK:

```typescript
cloudwatch.putMetricData({
  Namespace: naming.name({ type: 'cloudwatchMetricNamespace' }),
  MetricData: [
    {
      MetricName: 'RequestCount',
      Dimensions: naming.dimensions(),
      Value: 42,
      Unit: 'Count',
    },
  ],
})
```

For multi-tenant deployments, `Tenant` can be added as a dimension — but only when your tenant count is small (< ~50). CloudWatch bills per unique metric stream (namespace + all dimension values). Adding `Tenant` multiplies your metric count by the number of tenants: at 1,000 tenants and 50 metric names that is 50,000 streams (~$15,000/month). For high-cardinality per-tenant analysis, prefer CloudWatch Contributor Insights or EMF structured logs instead.

```typescript
// Only viable with a small, bounded tenant count
const tenantNaming = naming.with({ tenant: 't-a3f8b2' }).dimensionKeys('service', 'tenant')

tenantNaming.dimensions()
// → [{ Name: 'Service', Value: 'checkout-api' }, { Name: 'Tenant', Value: 't-a3f8b2' }]
```

### `.dimensions(overrides?)`

Returns `Array<{ Name: string; Value: string }>`. Dimension `Name` values use PascalCase (`Service`, `Domain`, `Environment`, `Org`, `Tenant`) to match AWS CloudWatch convention. Only dimensions with a resolved segment value are included.

### `.dimensionKeys(...keys)`

Set which segment keys appear as Dimensions. Defaults to `['service']`. Available keys: `org`, `domain`, `service`, `environment`, `tenant`.

```typescript
naming.dimensionKeys('service', 'environment', 'tenant').dimensions()
// → [{ Name: 'Service', ... }, { Name: 'Environment', ... }, { Name: 'Tenant', ... }]
```

Chainable — propagates to instances derived via `.with()`.

---

### `.tagRule(fn)`

Register a custom tag rule — a function that receives the resolved segment values and returns additional key-value pairs merged into the `tags()` output. Multiple rules run in registration order.

```typescript
// Flag sensitive resources
naming.tagRule((segments) => ({
  sensitive: String(segments.env === 'prod' && segments.domain === 'auth'),
}))

// Add a cost code derived from the domain
naming.tagRule((segments) => ({
  'cost-center': costCenterFor(segments.domain ?? ''),
}))
```

### `.tagAugment(fn)`

Register a tag augmentor — runs after all `tagRule()` results are merged. Receives a **snapshot** of the current accumulated tags and returns additional key-value pairs to merge in. Use this for tags computed from the already-resolved tag set, or for dynamic values that don't come from segments (timestamps, UUIDs).

```typescript
// Add a timestamp tag on every tags() call
naming.tagAugment(() => ({ 'updated-at': new Date().toISOString() }))

// Derive a composite tag from already-resolved tags
naming.tagAugment((tags) => ({
  'resource-id': `${tags['domain']}/${tags['service']}`,
}))
```

### `.policy(fn, message?)`

Register a tag policy — a predicate evaluated against the final resolved tags. If the predicate returns `false`, `tags()` throws with the supplied message. Policies run after limit validation.

```typescript
// Require a cost-center tag on every resource
naming
  .tagRule((segments) => ({ 'cost-center': costCenterFor(segments.domain) }))
  .policy((tags) => 'cost-center' in tags, 'cost-center tag is required')

// Require service tag to be non-empty
naming.policy((tags) => Boolean(tags['service']), 'service tag must not be empty')
```

### `.keyMax(n)` / `.valueMax(n)` / `.maxTags(n)`

Set tag size limits. Defaults match AWS constraints:

| Method     | Default | AWS limit                |
| ---------- | ------- | ------------------------ |
| `keyMax`   | 128     | 128 characters per key   |
| `valueMax` | 256     | 256 characters per value |
| `maxTags`  | 50      | 50 tags per resource     |

`tags()` throws if any limit is exceeded.

```typescript
// Stricter internal limits
naming.keyMax(64).valueMax(128).maxTags(20)
```

---

## IAM policy generation

The library can generate IAM policy documents directly from your naming conventions. Every resource type that is a direct IAM policy target carries built-in ARN construction metadata and curated action sets for three permission tiers — `read`, `readWrite`, and `manage`.

There are two modes: **static** (you declare which resource types to include) and **dynamic** (the convention intercepts `.name()` calls and records what was named).

### Setup — `.arnContext(context)`

Store the AWS account ID on the instance once. Region is sourced from the `region` segment already set on the instance.

```typescript
const conventions = new DerropsConventions({
  org: 'acme',
  env: 'prod',
  region: 'us-east-1',
  domain: 'payments',
  service: 'checkout-api',
}).arnContext({ accountId: '123456789012' })
```

You can also pass the context directly to `.staticPolicy()` / `.dynamicPolicy()` for per-call overrides (e.g. cross-account ARNs).

---

### Static mode

Declare resource types explicitly. ARNs are derived from the convention's segments.

```typescript
const doc = conventions
  .staticPolicy()
  .include('s3Bucket', { key: 'uploads' }, { permissions: 'read' })
  .include('dynamoDb', { key: 'transactions' }, { permissions: 'readWrite' })
  .include('ssmParam', { key: 'stripe-webhook-secret' }, { permissions: 'read' })
  .buildPolicy()
```

Produces a standard AWS IAM policy document:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:Get*", "s3:List*"],
      "Resource": [
        "arn:aws:s3:::prod--acme--payments--checkout-api--uploads",
        "arn:aws:s3:::prod--acme--payments--checkout-api--uploads/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Get*",
        "dynamodb:BatchGet*",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:Describe*",
        "dynamodb:Put*",
        "dynamodb:Update*",
        "dynamodb:Delete*",
        "dynamodb:BatchWrite*"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/acme--payments--checkout-api--transactions"
    },
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameter*", "ssm:DescribeParameters"],
      "Resource": "arn:aws:ssm:us-east-1:123456789012:parameter/acme/payments/checkout-api/stripe-webhook-secret"
    }
  ]
}
```

Use `actionsFor` as a fallback for types without a `permissions` annotation, or to override with custom action lists:

```typescript
const doc = conventions
  .staticPolicy()
  .include('lambdaFunction', { key: 'webhook-handler' }) // no permissions tier
  .buildPolicy({
    actionsFor: { lambdaFunction: ['lambda:InvokeFunction'] },
  })
```

---

### Dynamic mode

Create a session that intercepts every `.name()` call, records the ARN, and builds a policy from what was actually named. The return value of `.name()` is unchanged — it still returns the name string.

```typescript
const session = conventions.dynamicPolicy()

// Normal naming calls — each one is intercepted and recorded
const bucket = session.name({ type: 's3Bucket', key: 'uploads' }, { permissions: 'read' })
const table = session.name({ type: 'dynamoDb', key: 'transactions' }, { permissions: 'readWrite' })
const fn = session.name({ type: 'lambdaFunction', key: 'handler' }) // no annotation

console.log(bucket) // 'prod--acme--payments--checkout-api--uploads' (unchanged)

const doc = session.buildPolicy({
  // fallback actions for resources without a permissions annotation
  actionsFor: { lambdaFunction: ['lambda:InvokeFunction'] },
})
```

Inspect what was recorded at any point:

```typescript
session.recordedResources()
// → [
//     { type: 's3Bucket', name: 'prod--acme--...', arn: 'arn:aws:s3:::...', permissions: 'read' },
//     { type: 'dynamoDb', name: 'acme--...', arn: 'arn:aws:dynamodb:...', permissions: 'readWrite' },
//     { type: 'lambdaFunction', name: 'acme--...', arn: 'arn:aws:lambda:...', permissions: undefined },
//   ]
```

Resource types without ARN metadata (sub-resources, naming helpers) are recorded with `arn: null` and silently omitted from `buildPolicy()`.

---

### Permission tiers

| Tier        | Intent              | Wildcard pattern                              |
| ----------- | ------------------- | --------------------------------------------- |
| `read`      | Read-only access    | `Get*`, `List*`, `Describe*`                  |
| `readWrite` | Read + write/mutate | `read` actions + `Put*`, `Update*`, `Delete*` |
| `manage`    | Full control        | `<service>:*`                                 |

Some services use explicit actions where wildcards would over-grant (e.g. `lambda:InvokeFunction` in the `readWrite` tier rather than `lambda:Invoke*`).

Check the built-in action sets for any resource type:

```typescript
import { RESOURCE_TYPES } from '@derrops-conventions'
RESOURCE_TYPES.dynamoDb.permissions
// → { read: [...], readWrite: [...], manage: ['dynamodb:*'] }
```

---

### ARN construction

ARNs are constructed from:

```
arn:{partition}:{service}:{region}:{accountId}:{resourcePrefix}{name}{resourceSuffix}
```

- `partition` — defaults to `'aws'`; override via `.arnContext({ partition: 'aws-cn' })`
- `region` — sourced from the `region` segment; empty string for global services (IAM, S3 bucket-level, CloudFront)
- `accountId` — set via `.arnContext()` or passed directly to `.staticPolicy()` / `.dynamicPolicy()`
- `resourcePrefix` — e.g. `'function:'` for Lambda, `'table/'` for DynamoDB; empty for SNS/SQS where the name is appended flat

IAM roles and SSM parameters use a leading `/` in the name (from `leadingDelimiter: true`), so their ARNs are correct without an extra separator:

- `iamRole` → `arn:aws:iam::123:role/acme/payments/checkout-api/lambda-role`
- `ssmParam` → `arn:aws:ssm:us-east-1:123:parameter/acme/payments/checkout-api/stripe-key`

**S3 dual-ARN:** `s3Bucket` emits two entries in `Resource` — the bucket ARN for bucket-level actions (`s3:ListBucket`, `s3:GetBucketLocation`) and the objects ARN for object-level actions (`s3:GetObject`, `s3:PutObject`). This is handled automatically:

```json
"Resource": [
  "arn:aws:s3:::bucket-name",
  "arn:aws:s3:::bucket-name/*"
]
```

DynamoDB GSIs use `resourceSuffix: '/index/*'` — the policy targets all indexes on the named table:

- `dynamoDbGsi` → `arn:aws:dynamodb:us-east-1:123:table/acme--payments--checkout-api--by-user--gsi/index/*`

Use `buildArn()` directly for custom registered types:

```typescript
import { buildArn, DerropsConventions } from '@derrops-conventions'

DerropsConventions.registerResourceType('myQueue', {
  global: false,
  segmentDelimiter: '--',
  wordDelimiter: '-',
  iamService: 'sqs',
  arn: { service: 'sqs', includeRegion: true, includeAccount: true },
  permissions: {
    read: ['sqs:ReceiveMessage'],
    readWrite: ['sqs:ReceiveMessage', 'sqs:SendMessage'],
    manage: ['sqs:*'],
  },
})

buildArn('acme--platform--my-queue', RESOURCE_TYPES.myQueue.arn!, {
  accountId: '123456789012',
  region: 'us-east-1',
})
// → 'arn:aws:sqs:us-east-1:123456789012:acme--platform--my-queue'
```

---

### IAM-targetable resource types

The following types have full ARN + permission tier support. Types not listed (DNS records, naming helpers, sub-resources) do not have ARN metadata and are skipped in policy generation.

S3, CloudWatch Logs, ECR, ECS (cluster / service / task definition), DynamoDB, DynamoDB GSI, RDS (instance / parameter group / subnet group / proxy), Lambda (function / layer), IAM (role / policy / user), SNS, SQS (queue / FIFO / DLQ), Kinesis, EventBridge (bus / rule), API Gateway (REST / HTTP), Step Functions, ElastiCache (cluster / replication group), OpenSearch, SSM Parameter, Secrets Manager, AppConfig Application, Glue (database / job / crawler), Athena Workgroup, CloudFront Distribution, Backup Vault, MSK Cluster, WAF Web ACL.

---

## OpenSearch index naming

OpenSearch indexes are named at the **domain/entity** level, not the service level. An entity (e.g. `transactions`, `users`, `api-specs`) belongs to a domain — multiple services that produce or consume the same entity type share the same index.

```typescript
const naming = new DerropsConventions({ org: 'acme', domain: 'payments' })

// Two different services, same entity → same index name (correct)
naming.name({ type: 'openSearchIndex', entity: 'transactions' })
// → 'acme--payments--transactions'

// Different entity → different index
naming.name({ type: 'openSearchIndex', entity: 'refunds' })
// → 'acme--payments--refunds'

// Multi-tenant: add tenant to shard per tenant
naming.with({ tenant: 't-a3f8b2' }).name({ type: 'openSearchIndex', entity: 'transactions' })
// → 'acme--payments--transactions--t-a3f8b2'
```

The `entity` segment is intentionally absent from the default segment order. It only participates in `openSearchIndex` (via its explicit `segments` list). Passing `entity` to any other resource type has no effect.

---

## Network topology

The convention maps directly to the three-layer AWS network hierarchy. Each layer has its own provisioning lifecycle and the segment depth of each resource type encodes which layer it lives at.

### Three stability layers

```
Layer     Segments       Lifecycle                      Resources
────────  ─────────────  ─────────────────────────────  ──────────────────────────────────
Org       org            Provisioned once per account   VPC, Transit Gateway
Domain    org+domain     Added when a domain expands    Subnets, NACL, Route Tables, TGW Attachment
Service   org+domain+    Deployed per service release   Security Groups, ALBs, Target Groups
          service
```

- **Org resources** are the most stable. A VPC is created once and almost never changed. Resource type `segments` stop at `['org']`.
- **Domain resources** are structural. Adding a new domain (e.g. `analytics`) triggers subnet and NACL provisioning, but this happens infrequently. Segments stop at `['org', 'domain']`.
- **Service resources** are operational. Security groups are created and updated with each service deployment. Segments descend to `['org', 'domain', 'service', 'purpose']`.

This is why `subnet` and `networkAcl` do **not** include `service` in their segments — they are domain-scoped boundaries, not service-scoped.

### Topology generation

Call the layer methods to generate all resource names for a scope at once:

```typescript
const orgConvention = new DerropsConventions({ org: 'acme' })

// Org layer — provision once
orgConvention.orgNetworkLayer()
// → { vpc: 'acme', transitGateway: 'acme--tgw' }

// Domain layer — provision when a domain is added
orgConvention.with({ domain: 'payments' }).domainNetworkLayer(['1a', '1b', '1c'])
// → {
//   subnets: {
//     private:  ['acme--payments--private--1a', ...],
//     public:   ['acme--payments--public--1a', ...],
//     isolated: ['acme--payments--isolated--1a', ...],
//   },
//   nacl:         'acme--payments--nacl',
//   routeTables:  { private: 'acme--payments--private', public: 'acme--payments--public', isolated: 'acme--payments--isolated' },
//   tgwAttachment:'acme--payments--tgw-attach',
// }

// Service layer — provision with each service deployment
orgConvention.with({ domain: 'payments', service: 'checkout-api' })
  .serviceNetworkLayer(['web', 'db', 'internal'])
// → {
//   securityGroups: {
//     web:      'acme--payments--checkout-api--web',
//     db:       'acme--payments--checkout-api--db',
//     internal: 'acme--payments--checkout-api--internal',
//   }
// }
```

### Subnet kinds

Three standard tiers. Each gets a `/22` block within its domain's `/20`, with one `/24` per availability zone within that `/22`.

| Kind | Routing | `mapPublicIpOnLaunch` | Typical residents |
|---|---|---|---|
| `private` | Outbound via NAT gateway — no direct inbound | `false` | Application servers, ECS tasks, Lambda in VPC |
| `public` | Internet Gateway — direct inbound and outbound | `true` | Load balancers, NAT gateways, bastion hosts |
| `isolated` | No internet route in either direction | `false` | Databases (RDS, Aurora), OpenSearch, ElastiCache |

The flow is one-way: `internet ↔ public → private → isolated`. Resources in `isolated` can only be reached from within the VPC.

Not every domain needs all three tiers. A data-only domain (no load balancers) needs only `private` and `isolated`. Configure this per domain using `includeKinds` — see [Per-domain kind configuration](#per-domain-kind-configuration).

---

### CDK — provisioning the VPC

`topology()` returns names and CIDR blocks for every subnet, route table, NACL, and TGW attachment across all domains. Pass those directly to CDK L1 constructs.

The convention name (`subnet.name`) is used as the CloudFormation logical ID via `overrideLogicalId()`. This is what makes the infrastructure stable — as long as the name doesn't change, CloudFormation recognises the resource as existing and leaves it alone.

```typescript
import { Stack, Tags, type StackProps } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { DerropsConventions } from '@derrops-conventions'

const region = 'ap-southeast-2'

const orgC = new DerropsConventions({ org: 'acme', env: 'prod', region })
  .domain(['payments', 'identity'])
  .tagPrefix('acme:')
  .tagKeys('org', 'domain', 'environment')

// Compute the full plan — names and CIDRs for all domains, kinds, and AZs.
// This object is the authoritative source of truth for all network resource names.
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azAllocations: [
    { slot: 0, az: '1a' },
    { slot: 1, az: '1b' },
    { slot: 2, az: '1c' },
  ],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },
    { slot: 2, name: 'isolated' },
  ],
})

export class VpcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // ── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.CfnVPC(this, plan.vpc.name, {
      cidrBlock: plan.vpc.cidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    })
    vpc.overrideLogicalId(plan.vpc.name)
    orgC.applyTags((k, v) => Tags.of(vpc).add(k, v))

    // ── Internet Gateway (shared — public subnets across all domains use it) ─
    const igw = new ec2.CfnInternetGateway(this, `${plan.vpc.name}--igw`, {})
    new ec2.CfnVPCGatewayAttachment(this, `${plan.vpc.name}--igw-attach`, {
      vpcId: vpc.ref,
      internetGatewayId: igw.ref,
    })

    // ── Per-domain resources ──────────────────────────────────────────────────
    for (const [domainName, domain] of Object.entries(plan.domains)) {
      const domainC = orgC.with({ domain: domainName })

      // Network ACL — one per domain
      const nacl = new ec2.CfnNetworkAcl(this, domain.nacl, { vpcId: vpc.ref })
      nacl.overrideLogicalId(domain.nacl)
      domainC.applyTags((k, v) => Tags.of(nacl).add(k, v))

      // Route tables — one per kind actually allocated for this domain
      const routeTableRefs: Record<string, string> = {}
      for (const [kind, rtName] of Object.entries(domain.routeTables)) {
        const rt = new ec2.CfnRouteTable(this, rtName, { vpcId: vpc.ref })
        rt.overrideLogicalId(rtName)
        domainC.applyTags((k, v) => Tags.of(rt).add(k, v))
        routeTableRefs[kind] = rt.ref

        // public tier: default route via IGW
        // private tier: default route via NAT (add after NAT GW is created below)
        // isolated tier: no default route
        if (kind === 'public') {
          new ec2.CfnRoute(this, `${rtName}--igw`, {
            routeTableId: rt.ref,
            destinationCidrBlock: '0.0.0.0/0',
            gatewayId: igw.ref,
          })
        }
      }

      // Subnets — only the kinds this domain has, each with its stable CIDR
      for (const [kind, subnets] of Object.entries(domain.subnets)) {
        for (const subnet of subnets) {
          const cfnSubnet = new ec2.CfnSubnet(this, subnet.name, {
            vpcId: vpc.ref,
            cidrBlock: subnet.cidr,
            availabilityZone: `${region}${subnet.az}`,
            // Only public subnets assign a public IP automatically
            mapPublicIpOnLaunch: kind === 'public',
          })
          cfnSubnet.overrideLogicalId(subnet.name)
          domainC.applyTags((k, v) => Tags.of(cfnSubnet).add(k, v))

          new ec2.CfnSubnetRouteTableAssociation(
            this,
            `${subnet.name}--rta`,
            {
              subnetId: cfnSubnet.ref,
              routeTableId: routeTableRefs[kind]!,
            },
          )

          // NACLs — associate each subnet with the domain NACL
          new ec2.CfnSubnetNetworkAclAssociation(
            this,
            `${subnet.name}--nacl`,
            {
              subnetId: cfnSubnet.ref,
              networkAclId: nacl.ref,
            },
          )
        }
      }
    }
  }
}
```

This produces the following subnet layout for the `payments` domain:

```
payments  10.0.0.0/20
  private   10.0.0.0/22   → 10.0.0.0/24 (1a), 10.0.1.0/24 (1b), 10.0.2.0/24 (1c)
  public    10.0.4.0/22   → 10.0.4.0/24 (1a), 10.0.5.0/24 (1b), 10.0.6.0/24 (1c)
  isolated  10.0.8.0/22   → 10.0.8.0/24 (1a), 10.0.9.0/24 (1b), 10.0.10.0/24 (1c)

identity  10.0.16.0/20
  private   10.0.16.0/22  → 10.0.16.0/24 (1a), 10.0.17.0/24 (1b), 10.0.18.0/24 (1c)
  public    10.0.20.0/22  → 10.0.20.0/24 (1a), ...
  isolated  10.0.24.0/22  → 10.0.24.0/24 (1a), ...
```

---

### CDK — per-domain kind configuration

Not every domain needs all three tiers. Use `includeKinds` to declare which tiers a domain actually provisions. Only those route tables and subnets are created — there are no phantom resources.

```typescript
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azAllocations: [
    { slot: 0, az: '1a' },
    { slot: 1, az: '1b' },
    { slot: 2, az: '1c' },
  ],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },
    { slot: 2, name: 'isolated' },
  ],
  domains: {
    // identity has no public-facing load balancers — drop the public tier
    identity: { includeKinds: ['private', 'isolated'] },
    // platform only needs app + data tiers
    platform: { includeKinds: ['private', 'isolated'] },
    // analytics domain adds a dedicated ingest tier at the next available slot
    analytics: {
      additionalKinds: [{ slot: 3, name: 'ingest' }],
    },
  },
})

// payments gets all three kinds:   private, public, isolated
// identity gets two kinds:          private, isolated  (no public — no IGW route)
// platform gets two kinds:          private, isolated
// analytics gets four kinds:        private, public, isolated, ingest
```

The `isolated` subnets for `identity` keep their slot 2 CIDRs (`10.0.24.0/24`, etc.) even though the `public` tier is omitted. Removing a tier from `includeKinds` creates a gap in the address space, but that gap is harmless and preserves the stability of every other address.

---

### CDK — growing infrastructure without downtime

Subnet `slot` numbers determine CIDR offsets. Adding new subnets — a fourth AZ or a new kind tier — never changes the CIDRs of existing subnets. CloudFormation sees the existing resources as unchanged and only provisions the new ones.

**Adding a third AZ after initial deployment:**

```typescript
// v1 — initial deployment (2 AZs)
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azAllocations: [
    { slot: 0, az: '1a' },
    { slot: 1, az: '1b' },
  ],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },
    { slot: 2, name: 'isolated' },
  ],
})

// v2 — later, add a third AZ by appending slot 2
// Slots 0 and 1 are untouched → existing subnets are not modified
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azAllocations: [
    { slot: 0, az: '1a' },    // existing — CIDR unchanged
    { slot: 1, az: '1b' },    // existing — CIDR unchanged
    { slot: 2, az: '1c' },    // new — provisioned on next deploy
  ],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },
    { slot: 2, name: 'isolated' },
  ],
})
```

**Adding a new kind tier after initial deployment:**

```typescript
// v1 — initial deployment (private + isolated only)
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 2, name: 'isolated' },
    // slot 1 intentionally left vacant to insert public later between them,
    // or just use slot 3 if order doesn't matter
  ],
})

// v2 — add public tier by filling slot 1
// Slots 0 and 2 are untouched → private and isolated CIDRs are unchanged
const plan = orgC.topology({
  vpcCidr: '10.0.0.0/16',
  azs: ['1a', '1b', '1c'],
  defaultKinds: [
    { slot: 0, name: 'private' },
    { slot: 1, name: 'public' },    // new
    { slot: 2, name: 'isolated' },
  ],
})
```

The capacity limit is 4 slots per axis (0–3). With 4 kind slots and 4 AZ slots, one domain can hold up to 16 subnets. Use `capacityReport()` to check utilisation before deploying:

```typescript
const report = orgC.capacityReport({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'], ... })
if (report.warnings.length) {
  console.warn('Capacity warnings:\n' + report.warnings.join('\n'))
}
// Example warning: Domain "payments": 3 of 4 kind slots used (75%)
```

---

### Security group purposes

The `purpose` segment on `ec2SecurityGroup` encodes the access role — what the security group protects, not who calls it. Standard values:

| `purpose` | Inbound traffic |
|-----------|----------------|
| `web` | HTTP/HTTPS from ALB or internet |
| `internal` | Intra-domain service-to-service |
| `db` | Database protocols (PostgreSQL 5432, MySQL 3306) |
| `cache` | Cache protocols (Redis 6379) |
| `search` | OpenSearch/Elasticsearch (9200, 443) |
| `relay` | Outbound relay / egress |
| `bastion` | SSH from operator IP ranges |
| `worker` | Background processing |

The security group IS the named access object. `acme--payments--checkout-api--db` says exactly: "database-tier access control for checkout-api in the payments domain of the acme org."

### Cross-boundary patterns

```typescript
// Cross-org VPC peering — 'target' holds the remote org name
naming.name({ type: 'vpcPeering', target: 'globex' })
// → 'acme--globex--peer'

// AWS service endpoint inside a domain
// 'service' here is the AWS service name, not an application service
naming.name({ type: 'vpcEndpoint', service: 's3' })
// → 'acme--payments--s3--endpoint'
```

Use VPC peering for two-org point-to-point connections. Use Transit Gateway (`transitGateway` / `transitGatewayAttachment`) when connecting three or more orgs — peering grows as O(n²) connections, TGW as O(n) attachments.

See the [network topology guide](https://blog.slaops.com/blog/derrops-network-topology) for the full design rationale, CDK usage examples, and the access/permissions distinction.

---

## DNS subdomain patterns

Four patterns are supported. Use `.apexMapping()` to derive the effective zone per environment.

```typescript
const naming = new DerropsConventions({
  org: 'acme',
  apex: 'acme.com',
  env: 'dev',
  domain: 'payments',
  service: 'checkout-api',
}).apexMapping((s) => (s.env === 'prod' ? s.apex! : `${s.env}.${s.apex}`))

// service-first — checkout-api.dev.acme.com
naming.name({ type: 'route53Record' })

// tenant-first — t-a3f8b2.checkout-api.dev.acme.com
naming.with({ tenant: 't-a3f8b2' }).name({ type: 'route53TenantRecord' })

// wildcard — *.dev.acme.com
naming.name({ type: 'route53WildcardRecord' })

// zone apex (@) — dev.acme.com (for root A/AAAA records)
naming.name({ type: 'route53ApexRecord' })
```

Each pattern has matching variants for CloudFront aliases and ACM certificates:

| Pattern       | Route53                 | CloudFront                | ACM                    |
| ------------- | ----------------------- | ------------------------- | ---------------------- |
| service-first | `route53Record`         | `cloudFrontAlias`         | `acmCertificate`       |
| tenant-first  | `route53TenantRecord`   | `cloudFrontTenantAlias`   | `acmCertificateTenant` |
| wildcard      | `route53WildcardRecord` | `cloudFrontWildcardAlias` | —                      |
| apex (@)      | `route53ApexRecord`     | —                         | —                      |

Private hosted zones use `route53PrivateRecord` / `route53TenantPrivateRecord` instead of their public equivalents.

---

## Multi-tenancy

### Naming is organisational. Tags are the security boundary.

A resource name that contains a tenant ID tells you which tenant a resource belongs to. It does **not** prevent a different tenant's IAM principal from accessing it. If a Lambda execution role has `dynamodb:GetItem` on `arn:aws:dynamodb:*:*:table/acme--payments--checkout-api--*`, it can read any tenant's table regardless of whether the name contains `t-a3f8b2` or `t-9c1d44`.

Resource tag conditions on IAM policies are AWS's equivalent of **Row Level Security** in a relational database. In PostgreSQL, RLS filters rows at the engine layer so one user can never return another's rows. In AWS, `aws:ResourceTag/tenant` conditions filter access at the IAM evaluation layer so one tenant's principal can never receive a grant on another tenant's resource, even when the `Resource` ARN is a wildcard.

**The three-step enforcement pattern:**

```typescript
const tenantConvention = orgConvention
  .with({ tenant: 't-a3f8b2' })
  .tagKeys('org', 'domain', 'service', 'tenant')
  .policy((tags) => Boolean(tags['tenant']), 'tenant tag is required')

// 1 — Name it
const tableName = tenantConvention.name({ type: 'dynamoDb', key: 'orders' })
// → 'acme--payments--checkout-api--t-a3f8b2--orders'

// 2 — Tag it atomically at provisioning (CDK example)
const table = new dynamodb.Table(this, 'OrdersTable', { tableName })
tenantConvention.applyTags((k, v) => Tags.of(table).add(k, v))
// Applies: { tenant: 't-a3f8b2', domain: 'payments', service: 'checkout-api', ... }

// 3 — Enforce it via IAM condition
// tagCondition() + withCondition() generate the StringEquals condition on the resource tag.
// Without step 3, steps 1 and 2 provide zero cross-tenant protection.
const policy = tenantConvention
  .policyBuilder()
  .allow(withCondition(table.write(), tagCondition('aws:ResourceTag/tenant', 't-a3f8b2')))
  .build()
```

Tags must be applied **atomically at provisioning time**. A resource that exists without its `tenant` tag is unprotected — any principal whose policy matches the ARN wildcard can access it. The `.policy()` call above throws at synthesis time if the tag is missing, making this a deploy-time guarantee rather than an operational discipline.

See [Tag-Based Tenant Isolation (ABAC)](https://blog.slaops.com/blog/derrops-conventions#tag-based-tenant-isolation-abac) for the full decision matrix, service compatibility table, and session-tag (dynamic ABAC) pattern.

### Silo model — tenant in resource names

Pass an opaque `tenant` ID to add tenant-scoped prefixes:

```typescript
const tenantNaming = naming.with({ tenant: 't-a3f8b2' })

tenantNaming.name({ type: 'ssmParam', key: 'stripe-key' })
// → '/acme/payments/checkout-api/t-a3f8b2/stripe-key'

tenantNaming.name({ type: 's3Bucket', key: 'data' })
// → 'ap-southeast-2--prod--acme--payments--checkout-api--t-a3f8b2--data'
```

Tenant sits after `service` in the default order (tenant-second-last). This follows the stability principle: `org`, `domain`, and `service` are defined at system design time. `tenant` is provisioned at runtime. Placing it after the design-time segments keeps cross-tenant prefix patterns (`/acme/payments/checkout-api/*`) predictable for billing aggregators and audit tools, while tag conditions provide the per-tenant security boundary.

For the rare case where a resource type requires tenant further left (e.g. S3 buckets in strict silo isolation for global-namespace uniqueness), use `.moveSegment()` on a scoped copy:

```typescript
tenantNaming.with({}).moveSegment('tenant', 'domain').name({ type: 's3Bucket', key: 'data' })
// → 'ap-southeast-2--prod--acme--t-a3f8b2--payments--checkout-api--data'
```

**Always use an opaque ID, never a human-readable name.** Human-readable tenant names in globally unique namespaces (S3 buckets, CloudFront aliases) are squattable — a bad actor can pre-register `ap-southeast-2--prod--acme--bigcorp--data` before you onboard `bigcorp`. An opaque ID like `t-a3f8b2` is not guessable and remains stable even if a tenant rebrands.

---

## Resource types reference

`suffix` column shows the fixed string appended to the end of the name by the library automatically.

| Type key                      | AWS resource                  | Delimiter | Global? | Suffix           | Example output                                             |
| ----------------------------- | ----------------------------- | --------- | ------- | ---------------- | ---------------------------------------------------------- |
| `s3Bucket`                    | S3 Bucket                     | `--`      | ✅      |                  | `ap-southeast-2--prod--acme--payments--checkout-api--data` |
| `s3ObjectKey`                 | S3 Object Key                 | `/`       | ❌      |                  | `acme/payments/checkout-api/schema.sql`                    |
| `s3LogKey`                    | S3 Log/Event Key              | `/`       | ❌      |                  | `acme/payments/checkout-api/2024/01/15/14/events.json`     |
| `cloudwatchLogsGroup`         | CloudWatch Log Group          | `/`       | ❌      |                  | `/acme/payments/checkout-api/application-logs`             |
| `cloudwatchMetricNamespace`   | CloudWatch Metrics NS         | `/`       | ❌      |                  | `acme/payments` _(org/domain only)_                        |
| `ecr`                         | ECR Repository                | `/`       | ❌      |                  | `acme/payments/checkout-api`                               |
| `ecsCluster`                  | ECS Cluster                   | `--`      | ❌      |                  | `acme--payments--checkout-api--cluster`                    |
| `ecsService`                  | ECS Service                   | `--`      | ❌      |                  | `acme--payments--checkout-api`                             |
| `ecsTaskDefinition`           | ECS Task Definition           | `--`      | ❌      |                  | `acme--payments--checkout-api`                             |
| `dynamoDb`                    | DynamoDB Table                | `--`      | ❌      |                  | `acme--payments--checkout-api--transactions`               |
| `dynamoDbGsi`                 | DynamoDB GSI                  | `--`      | ❌      | `--gsi`          | `acme--payments--checkout-api--by-user--gsi`               |
| `rdsInstance`                 | RDS Instance                  | `--`      | ❌      |                  | `acme--payments--checkout-api--primary`                    |
| `rdsDbName`                   | RDS Database Name             | `_`       | ❌      |                  | `acme_payments_checkout_api`                               |
| `rdsParameterGroup`           | RDS Parameter Group           | `--`      | ❌      |                  | `acme--payments--checkout-api--params`                     |
| `rdsSubnetGroup`              | RDS Subnet Group              | `--`      | ❌      |                  | `acme--payments--checkout-api--subnet-group`               |
| `rdsProxy`                    | RDS Proxy                     | `--`      | ❌      |                  | `acme--payments--checkout-api--proxy`                      |
| `ec2Instance`                 | EC2 Instance                  | `--`      | ❌      |                  | `acme--payments--checkout-api--web--01` _(kind + num)_     |
| `ec2SecurityGroup`            | EC2 Security Group            | `--`      | ❌      |                  | `acme--payments--checkout-api--web` _(purpose)_            |
| `ec2Volume`                   | EC2 Volume                    | `--`      | ❌      |                  | `acme--payments--checkout-api--data` _(purpose)_           |
| `ec2ElasticIp`                | EC2 Elastic IP                | `--`      | ❌      | `--eip`          | `acme--payments--checkout-api--eip`                        |
| `lambdaFunction`              | Lambda Function               | `--`      | ❌      |                  | `acme--payments--checkout-api--webhook-handler`            |
| `lambdaLayer`                 | Lambda Layer                  | `--`      | ❌      |                  | `acme--shared-utilities--common-libs`                      |
| `lambdaAlias`                 | Lambda Alias                  | `--`      | ❌      |                  | `prod` _(env only)_                                        |
| `autoScalingGroup`            | Auto Scaling Group            | `--`      | ❌      | `--asg`          | `acme--payments--checkout-api--asg`                        |
| `launchTemplate`              | Launch Template               | `--`      | ❌      |                  | `acme--payments--checkout-api--launch-template`            |
| `iamRole`                     | IAM Role (path)               | `/`       | ❌      |                  | `/acme/payments/checkout-api/lambda-role`                  |
| `iamPath`                     | IAM Path prefix               | `/`       | ❌      |                  | `/acme/payments/checkout-api/`                             |
| `iamPolicy`                   | IAM Policy                    | `--`      | ❌      |                  | `acme--payments--checkout-api--s3-access-policy`           |
| `iamUser`                     | IAM User                      | `--`      | ❌      |                  | `acme--payments--checkout-api--service-user`               |
| `route53HostedZone`           | Route53 Hosted Zone           | `.`       | ❌      |                  | `dev.acme.com`                                             |
| `route53Record`               | Route53 DNS Record            | `.`       | ❌      |                  | `checkout-api.dev.acme.com` _(service-first)_              |
| `route53PrivateRecord`        | Route53 Private Record        | `.`       | ❌      |                  | `checkout-api.dev.acme.com` _(service-first)_              |
| `route53ApexRecord`           | Route53 Apex (@) Record       | `.`       | ❌      |                  | `dev.acme.com` _(zone only, no service prefix)_            |
| `route53WildcardRecord`       | Route53 Wildcard Record       | `.`       | ❌      |                  | `*.dev.acme.com`                                           |
| `route53TenantRecord`         | Route53 Tenant Record         | `.`       | ❌      |                  | `t-a3f8b2.checkout-api.dev.acme.com` _(tenant-first)_      |
| `route53TenantPrivateRecord`  | Route53 Tenant Private Record | `.`       | ❌      |                  | `t-a3f8b2.checkout-api.dev.acme.com` _(tenant-first)_      |
| `cloudFrontDistribution`      | CloudFront Distribution       | `--`      | ❌      |                  | `acme--payments--checkout-api--cdn`                        |
| `cloudFrontAlias`             | CloudFront Alias (CNAME)      | `.`       | ❌      |                  | `checkout-api.dev.acme.com` _(service-first)_              |
| `cloudFrontWildcardAlias`     | CloudFront Wildcard Alias     | `.`       | ❌      |                  | `*.dev.acme.com`                                           |
| `cloudFrontTenantAlias`       | CloudFront Tenant Alias       | `.`       | ❌      |                  | `t-a3f8b2.checkout-api.dev.acme.com` _(tenant-first)_      |
| `acmCertificate`              | ACM Certificate               | `.`       | ❌      |                  | `checkout-api.dev.acme.com` _(service-first)_              |
| `acmCertificateTenant`        | ACM Certificate (tenant)      | `.`       | ❌      |                  | `t-a3f8b2.checkout-api.dev.acme.com` _(tenant-first)_      |
| `vpc`                         | VPC                           | `--`      | ❌      |                  | `acme--payments--checkout-api--vpc`                        |
| `subnet`                      | Subnet                        | `--`      | ❌      |                  | `acme--payments--checkout-api--private--1a` _(kind + az)_  |
| `routeTable`                  | Route Table                   | `--`      | ❌      |                  | `acme--payments--checkout-api--rt-private`                 |
| `networkAcl`                  | Network ACL                   | `--`      | ❌      | `--nacl`         | `acme--payments--checkout-api--nacl`                       |
| `alb`                         | ALB / NLB                     | `--`      | ❌      |                  | `acme--payments--checkout-api--alb`                        |
| `targetGroup`                 | Target Group                  | `--`      | ❌      |                  | `acme--payments--checkout-api--checkout` _(purpose)_       |
| `snsTopic`                    | SNS Topic                     | `--`      | ❌      |                  | `acme--payments--checkout-api--transactions`               |
| `sqsQueue`                    | SQS Queue                     | `--`      | ❌      |                  | `acme--payments--checkout-api--events`                     |
| `sqsFifoQueue`                | SQS FIFO Queue                | `--`      | ❌      | `.fifo`          | `acme--payments--checkout-api--events.fifo`                |
| `sqsDlq`                      | SQS Dead-letter Queue         | `--`      | ❌      | `--dlq`          | `acme--payments--checkout-api--events--dlq`                |
| `kinesisStream`               | Kinesis Stream                | `--`      | ❌      |                  | `acme--payments--checkout-api--events`                     |
| `eventBridgeBus`              | EventBridge Bus               | `--`      | ❌      |                  | `acme--payments--checkout-api--events`                     |
| `eventBridgeRule`             | EventBridge Rule              | `--`      | ❌      | `-rule`          | `acme--payments--checkout-api--process-webhook-rule`       |
| `kafkaTopic`                  | Kafka / MSK Topic             | `.`       | ❌      |                  | `acme.payments.checkout-api.events`                        |
| `apiGatewayRestApi`           | API Gateway REST API          | `--`      | ❌      |                  | `acme--payments--checkout-api--api`                        |
| `apiGatewayHttpApi`           | API Gateway HTTP API          | `--`      | ❌      |                  | `acme--payments--checkout-api--http-api`                   |
| `apiGatewayKey`               | API Gateway Key               | `--`      | ❌      |                  | `acme--payments--checkout-api--partner-a` _(consumer)_     |
| `apiGatewayStage`             | API Gateway Stage             | `--`      | ❌      |                  | `prod` _(env only)_                                        |
| `appSyncApi`                  | AppSync API                   | `--`      | ❌      |                  | `acme--payments--checkout-api--api`                        |
| `appSyncDataSource`           | AppSync Data Source           | `--`      | ❌      |                  | `acme--payments--checkout-api--user-table` _(target)_      |
| `stepFunctions`               | Step Functions                | `--`      | ❌      |                  | `acme--payments--checkout-api--order-processing`           |
| `elastiCacheCluster`          | ElastiCache Cluster           | `--`      | ❌      |                  | `acme--payments--checkout-api--cache`                      |
| `elastiCacheReplicationGroup` | ElastiCache Replication Group | `--`      | ❌      |                  | `acme--payments--checkout-api--replication-group`          |
| `elastiCacheParameterGroup`   | ElastiCache Parameter Group   | `--`      | ❌      | `--params`       | `acme--payments--checkout-api--params`                     |
| `openSearchDomain`            | OpenSearch Domain             | `--`      | ❌      |                  | `acme--payments--checkout-api`                             |
| `openSearchIndex`             | OpenSearch Index              | `--`      | ❌      |                  | `acme--payments--transactions` _(org/domain/entity)_       |
| `ssmParam`                    | SSM Parameter                 | `/`       | ❌      |                  | `/acme/payments/checkout-api/stripe-webhook-secret`        |
| `ssmDocument`                 | SSM Document                  | `--`      | ❌      |                  | `acme--payments--checkout-api--patch-baseline`             |
| `ssmMaintenanceWindow`        | SSM Maintenance Window        | `--`      | ❌      | `-window`        | `acme--payments--checkout-api--weekend-window`             |
| `secretsManager`              | Secrets Manager Secret        | `/`       | ❌      |                  | `acme/payments/checkout-api/db-password`                   |
| `appConfigApplication`        | AppConfig Application         | `--`      | ❌      |                  | `acme--payments--checkout-api`                             |
| `appConfigEnvironment`        | AppConfig Environment         | `--`      | ❌      |                  | `prod` _(env only)_                                        |
| `appConfigProfile`            | AppConfig Profile             | `--`      | ❌      | `-profile`       | `acme--payments--checkout-api--feature-flags-profile`      |
| `glueDatabase`                | Glue Database                 | `_`       | ❌      |                  | `acme_payments_checkout_api`                               |
| `glueJob`                     | Glue Job                      | `--`      | ❌      | `-job`           | `acme--payments--checkout-api--transform-job`              |
| `glueCrawler`                 | Glue Crawler                  | `--`      | ❌      | `-crawler`       | `acme--payments--checkout-api--raw-data-crawler`           |
| `athenaWorkgroup`             | Athena Workgroup              | `--`      | ❌      |                  | `acme--analytics--etl--workgroup`                          |
| `redshiftCluster`             | Redshift Cluster              | `--`      | ❌      |                  | `acme--analytics--warehouse--cluster`                      |
| `redshiftDatabase`            | Redshift Database             | `_`       | ❌      |                  | `acme_analytics_warehouse`                                 |
| `redshiftSubnetGroup`         | Redshift Subnet Group         | `--`      | ❌      | `--subnet-group` | `acme--payments--checkout-api--subnet-group`               |
| `mskCluster`                  | MSK Cluster                   | `--`      | ❌      |                  | `acme--events--streaming--cluster`                         |
| `cloudFormationStack`         | CloudFormation Stack          | `--`      | ❌      | `-stack`         | `acme--payments--checkout-api--infra-stack`                |
| `configRule`                  | AWS Config Rule               | `--`      | ❌      | `-rule`          | `acme--payments--checkout-api--encryption-enabled-rule`    |
| `configAggregator`            | Config Aggregator             | `--`      | ❌      |                  | `acme--payments--config-aggregator`                        |
| `wafWebAcl`                   | WAF Web ACL                   | `--`      | ❌      | `--waf`          | `acme--payments--checkout-api--waf`                        |
| `wafIpSet`                    | WAF IP Set                    | `--`      | ❌      | `--ipset`        | `acme--payments--checkout-api--blocked-ips--ipset`         |
| `wafRuleGroup`                | WAF Rule Group                | `--`      | ❌      |                  | `acme--payments--checkout-api--rate-limit`                 |
| `serviceCatalogPortfolio`     | Service Catalog Portfolio     | `--`      | ❌      | `--portfolio`    | `acme--payments--portfolio`                                |
| `serviceCatalogProduct`       | Service Catalog Product       | `--`      | ❌      | `-product`       | `acme--payments--checkout-api--product`                    |
| `quickSightDataset`           | QuickSight Dataset            | `--`      | ❌      | `--dataset`      | `acme--payments--checkout-api--orders--dataset`            |
| `quickSightAnalysis`          | QuickSight Analysis           | `--`      | ❌      | `--analysis`     | `acme--payments--checkout-api--revenue--analysis`          |
| `quickSightDashboard`         | QuickSight Dashboard          | `--`      | ❌      |                  | `acme--payments--checkout-api--revenue`                    |
| `backupPlan`                  | AWS Backup Plan               | `--`      | ❌      |                  | `acme--payments--checkout-api--backup-plan`                |
| `backupVault`                 | AWS Backup Vault              | `--`      | ❌      |                  | `acme--payments--checkout-api--vault`                      |
| `xraySamplingRule`            | X-Ray Sampling Rule           | `--`      | ❌      |                  | `acme--payments--checkout-api--sampling-rule`              |
| `securityHubInsight`          | Security Hub Insight          | `--`      | ❌      |                  | `acme--payments--checkout-api--critical-findings-insight`  |

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
