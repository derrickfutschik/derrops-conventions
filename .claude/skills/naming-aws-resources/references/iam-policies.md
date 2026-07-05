# IAM policy generation

The library builds IAM policy documents directly from your naming convention, so ARNs and action sets stay in lockstep with the names you provision. Every IAM-targetable resource type carries ARN metadata plus curated action sets for three tiers: `read`, `readWrite`, `manage`.

Setup is always the same: store the account ID once with `.arnContext({ accountId })`. Region comes from the `region` segment. Partition defaults to `aws` (override with `.arnContext({ partition: 'aws-cn' })`).

```typescript
const conventions = new DerropsConventions({
  org: 'acme', env: 'prod', region: 'us-east-1',
  domain: 'payments', service: 'checkout-api',
}).arnContext({ accountId: '123456789012' })
```

There are three ways to produce a policy. Pick by how you already write code.

## 1. Static mode — declare the resources

Best when you have an explicit list of resources a role needs.

```typescript
const doc = conventions.staticPolicy()
  .include('s3Bucket', { key: 'uploads' }, { permissions: 'read' })
  .include('dynamoDb', { key: 'transactions' }, { permissions: 'readWrite' })
  .include('ssmParam', { key: 'stripe-webhook-secret' }, { permissions: 'read' })
  .buildPolicy()
```

For types without a `permissions` tier (e.g. `lambdaFunction`), supply actions via `buildPolicy({ actionsFor })`:

```typescript
conventions.staticPolicy()
  .include('lambdaFunction', { key: 'webhook-handler' })
  .buildPolicy({ actionsFor: { lambdaFunction: ['lambda:InvokeFunction'] } })
```

## 2. Dynamic mode — record what gets named

Best when naming and policy live in the same code path. `session.name()` returns the name string unchanged but records the ARN behind the scenes.

```typescript
const session = conventions.dynamicPolicy()
const bucket = session.name({ type: 's3Bucket', key: 'uploads' }, { permissions: 'read' })
const table  = session.name({ type: 'dynamoDb', key: 'transactions' }, { permissions: 'readWrite' })
session.name({ type: 'lambdaFunction', key: 'handler' }) // no annotation → use actionsFor

session.recordedResources() // inspect { type, name, arn, permissions }[]
const doc = session.buildPolicy({ actionsFor: { lambdaFunction: ['lambda:InvokeFunction'] } })
```

Types without ARN metadata (DNS records, naming helpers, sub-resources) record `arn: null` and are silently dropped from the document.

## 3. Grant builder — `.resource()` + `.policyBuilder()`

Best for fine-grained, condition-carrying grants. `.resource()` returns an object with `.read()` / `.write()` / `.manage()` grant methods; `.policyBuilder()` merges grants into statements. No `arnContext` needed for the builder itself — ARNs ride on the `Resource`.

```typescript
const table  = conventions.resource({ type: 'dynamoDb', key: 'orders' })
const bucket = conventions.resource({ type: 's3Bucket', key: 'uploads' })

const doc = conventions.policyBuilder()
  .allow(table.read(), bucket.read())   // merged into one statement
  .allow(bucket.write())
  .build()
```

This is the mode used for tenant isolation — wrap a grant with a resource-tag condition so a wildcard ARN can't leak across tenants:

```typescript
import { withCondition, tagCondition } from 'derrops-conventions'

const tenantC = conventions.with({ tenant: 't-a3f8b2' })
const table = tenantC.resource({ type: 'dynamoDb', key: 'orders' })

const doc = tenantC.policyBuilder()
  .allow(withCondition(table.write(), tagCondition('aws:ResourceTag/tenant', 't-a3f8b2')))
  .build()
```

Condition helpers exported from the package: `withCondition`, `tagCondition`, `sessionTagCondition`, `s3PrefixCondition`, `rawGrant`.

## Permission tiers

| Tier | Intent | Pattern |
|---|---|---|
| `read` | read-only | `Get*`, `List*`, `Describe*` |
| `readWrite` | read + mutate | read actions + `Put*`, `Update*`, `Delete*` |
| `manage` | full control | `<service>:*` |

Some services use explicit actions where a wildcard would over-grant (e.g. `lambda:InvokeFunction` rather than `lambda:Invoke*`). Inspect any type's sets with `RESOURCE_TYPES.<type>.permissions`.

## ARN construction notes

- Shape: `arn:{partition}:{service}:{region}:{accountId}:{resourcePrefix}{name}{resourceSuffix}`.
- Global services (IAM, S3 bucket-level, CloudFront) emit an empty region.
- `s3Bucket` emits **two** ARNs — bucket (`arn:aws:s3:::name`) and objects (`.../*`) — automatically.
- `dynamoDbGsi` targets `.../index/*` on the named table.
- `iamRole` / `ssmParam` carry a leading `/` in the name, so their ARNs are correct without an extra separator.
- Use `buildArn(name, arnConfig, { accountId, region })` for custom `registerResourceType` entries.

The full IAM-targetable type list is in the repo `README.md` under "IAM-targetable resource types".
