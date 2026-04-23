/**
 * Tenant policy tests — demonstrates how to use DerropsConventions to produce IAM policy
 * documents scoped to a specific tenant, covering three patterns:
 *
 *   1. Silo model  — tenant has dedicated resources; ARN includes tenant segment directly.
 *   2. Pool model  — shared resources; IAM conditions restrict to a tenant-specific prefix or tag.
 *   3. ABAC model  — session-tag matching; one policy works for all tenants via tag variables.
 *   4. Resource-based policies — bucket/domain policies granting a principal access to tenant data.
 */
import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import {
  PolicyBuilder,
  withCondition,
  tagCondition,
  sessionTagCondition,
  s3PrefixCondition,
  rawGrant,
} from '../policy/PolicyBuilder.js'

const TENANT_ID = 't-abc123'
const ACCOUNT_ID = '123456789012'
const REGION = 'ap-southeast-2'

const org = new DerropsConventions({
  org: 'slaops',
  region: REGION,
  env: 'prod',
}).arnContext({ accountId: ACCOUNT_ID })

const platform = org.with({ domain: 'platform' })
const oaspec = org.with({ domain: 'oaspec' })

// ── 1. Silo model ─────────────────────────────────────────────────────────────
// Each tenant has dedicated resources. The tenant segment in the naming convention
// produces a unique name (and ARN) per tenant — no conditions needed.

describe('silo model — tenant-scoped resource ARNs', () => {
  const tenantOaspec = oaspec.with({ tenant: TENANT_ID, service: 'oaspec' })

  it('tenant OpenSearch domain ARN includes tenant segment', () => {
    const domain = tenantOaspec.resource({ type: 'openSearchDomain' })
    expect(domain.name).toContain(TENANT_ID)
    expect(domain.arn).toContain(TENANT_ID)
  })

  it('tenant S3 bucket ARN includes tenant segment (global naming)', () => {
    const bucket = oaspec
      .with({ tenant: TENANT_ID, service: 'storage' })
      .resource({ type: 's3Bucket' })
    expect(bucket.name).toContain(TENANT_ID)
    expect(bucket.arns[0]).toContain(TENANT_ID)
  })

  it('silo policy grants read on tenant-specific domain only', () => {
    const domain = tenantOaspec.resource({ type: 'openSearchDomain' })
    const doc = new PolicyBuilder().allow(domain.read()).build()

    expect(doc.Statement).toHaveLength(1)
    const resources = doc.Statement[0]!.Resource as string[]
    // Both domain ARN and domain/* are present (policyResourceSuffix)
    expect(resources).toHaveLength(2)
    expect(resources[0]).toContain(TENANT_ID)
    expect(resources[1]).toBe(resources[0] + '/*')
    // No condition needed — tenant is in the ARN
    expect(doc.Statement[0]!.Condition).toBeUndefined()
  })

  it('silo policy grants write on tenant-specific DynamoDB table and GSI (merged)', () => {
    const tenantPlatform = platform.with({ tenant: TENANT_ID, service: 'events' })
    const table = tenantPlatform.resource({ type: 'dynamoDb', key: 'log' })
    const gsi = tenantPlatform.resource({ type: 'dynamoDbGsi', key: 'log' })

    const doc = new PolicyBuilder().allow(table.write(), gsi.write()).build()

    // Same action set → merged into one statement
    expect(doc.Statement).toHaveLength(1)
    const resources = doc.Statement[0]!.Resource as string[]
    // Table ARN
    expect(
      resources.some(
        (r) => r.includes(`table/`) && r.includes(TENANT_ID) && !r.includes('/index/'),
      ),
    ).toBe(true)
    // GSI ARN (--gsi stripped, /index/* appended)
    expect(resources.some((r) => r.includes('/index/*') && !r.includes('--gsi'))).toBe(true)
  })

  it('tenant SSM param path includes tenant', () => {
    const param = tenantOaspec.resource({ type: 'ssmParam', key: 'api-key' })
    expect(param.name).toContain(`/${TENANT_ID}/`)
    expect(param.arn).toContain(TENANT_ID)
  })
})

// ── 2. Pool model — tag conditions ────────────────────────────────────────────
// Resources are shared across tenants. IAM conditions restrict access to data
// tagged with the specific tenant's ID.

describe('pool model — tag conditions', () => {
  const sharedDomain = oaspec.with({ service: 'oaspec' }).resource({ type: 'openSearchDomain' })
  const sharedBucket = oaspec.with({ service: 'storage' }).resource({ type: 's3Bucket' })

  it('tagCondition produces StringEquals condition for a resource tag', () => {
    const cond = tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID)
    expect(cond).toEqual({ StringEquals: { 'aws:ResourceTag/slaops:tenant': TENANT_ID } })
  })

  it('withCondition attaches condition to a grant without mutating the original', () => {
    const original = sharedDomain.read()
    const conditioned = withCondition(
      original,
      tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID),
    )
    expect(original.condition).toBeUndefined()
    expect(conditioned.condition).toBeDefined()
    expect(conditioned.arns).toEqual(original.arns)
    expect(conditioned.actions).toEqual(original.actions)
  })

  it('pool policy grants read on shared domain with tenant tag condition', () => {
    const doc = new PolicyBuilder()
      .allow(
        withCondition(
          sharedDomain.read(),
          tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID),
        ),
      )
      .build()

    expect(doc.Statement).toHaveLength(1)
    const stmt = doc.Statement[0]!
    expect(stmt.Effect).toBe('Allow')
    expect(stmt.Condition).toEqual({
      StringEquals: { 'aws:ResourceTag/slaops:tenant': TENANT_ID },
    })
    const resources = stmt.Resource as string[]
    // domain + domain/* — shared domain, not tenant-specific name
    expect(resources).toHaveLength(2)
    expect(resources[0]).not.toContain(TENANT_ID)
  })

  it('pool policy grants write on shared S3 bucket with S3 prefix condition', () => {
    const doc = new PolicyBuilder()
      .allow(withCondition(sharedBucket.write(), s3PrefixCondition(TENANT_ID)))
      .build()

    expect(doc.Statement).toHaveLength(1)
    const stmt = doc.Statement[0]!
    expect(stmt.Condition).toEqual({
      StringLike: { 's3:prefix': [TENANT_ID, `${TENANT_ID}/*`] },
    })
    expect(stmt.Action).toContain('s3:Put*')
  })

  it('s3PrefixCondition scopes ListBucket to tenant prefix and GetObject to tenant objects', () => {
    const cond = s3PrefixCondition(TENANT_ID)
    expect(cond['StringLike']!['s3:prefix']).toContain(TENANT_ID)
    expect(cond['StringLike']!['s3:prefix']).toContain(`${TENANT_ID}/*`)
  })

  it('withCondition merges two conditions on the same operator', () => {
    const base = withCondition(
      sharedDomain.read(),
      tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID),
    )
    const combined = withCondition(base, { StringEquals: { 'aws:RequestedRegion': REGION } })

    expect(combined.condition!['StringEquals']).toEqual({
      'aws:ResourceTag/slaops:tenant': TENANT_ID,
      'aws:RequestedRegion': REGION,
    })
  })

  it('withCondition merges conditions across different operators', () => {
    const base = withCondition(sharedBucket.write(), s3PrefixCondition(TENANT_ID))
    const combined = withCondition(base, tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID))

    expect(combined.condition!['StringLike']).toBeDefined()
    expect(combined.condition!['StringEquals']).toBeDefined()
  })

  it('grants with different conditions produce separate statements (no merging)', () => {
    const tenantA = withCondition(
      sharedDomain.read(),
      tagCondition('aws:ResourceTag/slaops:tenant', 't-aaaa'),
    )
    const tenantB = withCondition(
      sharedDomain.read(),
      tagCondition('aws:ResourceTag/slaops:tenant', 't-bbbb'),
    )

    const doc = new PolicyBuilder().allow(tenantA, tenantB).build()

    // Same actions, same resources, different conditions → 2 statements
    expect(doc.Statement).toHaveLength(2)
    const conditions = doc.Statement.map(
      (s) => s.Condition!['StringEquals']!['aws:ResourceTag/slaops:tenant'],
    )
    expect(conditions).toContain('t-aaaa')
    expect(conditions).toContain('t-bbbb')
  })

  it('grants with the same condition are still merged', () => {
    const table1 = platform.with({ service: 'db' }).resource({ type: 'dynamoDb', key: 'orders' })
    const table2 = platform.with({ service: 'db' }).resource({ type: 'dynamoDb', key: 'sessions' })

    const cond = tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID)
    const doc = new PolicyBuilder()
      .allow(withCondition(table1.read(), cond), withCondition(table2.read(), cond))
      .build()

    // Same actions + same condition → merged into one statement with 2 resource ARNs
    expect(doc.Statement).toHaveLength(1)
    expect(Array.isArray(doc.Statement[0]!.Resource)).toBe(true)
    expect(doc.Statement[0]!.Resource as string[]).toHaveLength(2)
  })
})

// ── 3. ABAC model — session-tag matching ──────────────────────────────────────
// One policy per role type; access is scoped dynamically by matching the caller's
// principal session tag against the resource's tag. No per-tenant policy variants.

describe('ABAC model — session tag conditions', () => {
  const sharedTable = platform
    .with({ service: 'api' })
    .resource({ type: 'dynamoDb', key: 'events' })

  it('sessionTagCondition produces StringEquals with IAM variable referencing principal tag', () => {
    const cond = sessionTagCondition('slaops:tenant')
    expect(cond).toEqual({
      StringEquals: {
        'aws:ResourceTag/slaops:tenant': '${aws:PrincipalTag/slaops:tenant}',
      },
    })
  })

  it('ABAC policy allows read when resource and principal tenant tags match', () => {
    const doc = new PolicyBuilder()
      .allow(withCondition(sharedTable.read(), sessionTagCondition('slaops:tenant')))
      .build()

    expect(doc.Statement).toHaveLength(1)
    const stmt = doc.Statement[0]!
    expect(stmt.Condition!['StringEquals']!['aws:ResourceTag/slaops:tenant']).toBe(
      '${aws:PrincipalTag/slaops:tenant}',
    )
  })

  it('ABAC policy with multiple resources still merges on same session-tag condition', () => {
    const table1 = platform.with({ service: 'svc-a' }).resource({ type: 'dynamoDb', key: 'data' })
    const table2 = platform.with({ service: 'svc-b' }).resource({ type: 'dynamoDb', key: 'data' })
    const cond = sessionTagCondition('slaops:tenant')

    const doc = new PolicyBuilder()
      .allow(withCondition(table1.read(), cond), withCondition(table2.read(), cond))
      .build()

    // Same DynamoDB read actions + same ABAC condition → one merged statement
    expect(doc.Statement).toHaveLength(1)
    expect(Array.isArray(doc.Statement[0]!.Resource)).toBe(true)
  })
})

// ── 4. Resource-based policies ────────────────────────────────────────────────
// S3 bucket policies and OpenSearch access policies where the *resource* carries
// the policy granting access to a principal.

describe('resource-based policies — principal access', () => {
  const sharedBucket = oaspec.with({ service: 'storage' }).resource({ type: 's3Bucket' })
  const tenantRoleArn = `arn:aws:iam::${ACCOUNT_ID}:role/${TENANT_ID}-execution-role`

  it('bucket resource policy grants a specific tenant role read access via additionalStatements', () => {
    const doc = new PolicyBuilder().build({
      additionalStatements: [
        {
          Sid: 'TenantRead',
          Effect: 'Allow',
          Principal: { AWS: tenantRoleArn },
          Action: ['s3:GetObject'],
          Resource: sharedBucket.arns[1]!, // bucket/*
          Condition: { StringLike: { 's3:prefix': [`${TENANT_ID}/*`] } },
        },
      ],
    })

    expect(doc.Statement).toHaveLength(1)
    const stmt = doc.Statement[0]!
    expect(stmt.Principal).toEqual({ AWS: tenantRoleArn })
    expect(stmt.Condition!['StringLike']!['s3:prefix']).toContain(`${TENANT_ID}/*`)
  })

  it('bucket policy denies access to other tenants via tag condition on principal', () => {
    const doc = new PolicyBuilder().build({
      additionalStatements: [
        {
          Sid: 'DenyOtherTenants',
          Effect: 'Deny',
          Principal: '*',
          Action: ['s3:GetObject', 's3:PutObject'],
          Resource: sharedBucket.arns[1]!,
          Condition: {
            StringNotEquals: { 'aws:PrincipalTag/slaops:tenant': TENANT_ID },
          },
        },
      ],
    })

    expect(doc.Statement[0]!.Effect).toBe('Deny')
    expect(doc.Statement[0]!.Condition!['StringNotEquals']).toBeDefined()
  })

  it('bucket policy combining identity and resource statements', () => {
    const tenantBucket = oaspec
      .with({ tenant: TENANT_ID, service: 'storage' })
      .resource({ type: 's3Bucket' })

    const doc = new PolicyBuilder()
      .allow(withCondition(tenantBucket.read(), s3PrefixCondition(TENANT_ID)))
      .build({
        additionalStatements: [
          {
            Sid: 'GrantPrincipal',
            Effect: 'Allow',
            Principal: { AWS: tenantRoleArn },
            Action: ['s3:ListBucket'],
            Resource: tenantBucket.arns[0]!,
          },
        ],
      })

    expect(doc.Statement).toHaveLength(2)
    // First: identity-based with prefix condition
    expect(doc.Statement[0]!.Condition).toBeDefined()
    expect(doc.Statement[0]!.Principal).toBeUndefined()
    // Second: resource-based with principal
    expect(doc.Statement[1]!.Principal).toEqual({ AWS: tenantRoleArn })
  })

  it('OpenSearch domain access policy for a tenant principal', () => {
    const domain = oaspec.with({ service: 'oaspec' }).resource({ type: 'openSearchDomain' })

    const doc = new PolicyBuilder().build({
      additionalStatements: [
        {
          Sid: 'TenantIndexAccess',
          Effect: 'Allow',
          Principal: { AWS: tenantRoleArn },
          Action: ['es:ESHttpGet', 'es:ESHttpPost', 'es:ESHttpPut'],
          // Grant access to tenant's index pattern only
          Resource: `${domain.arns[0]}/${TENANT_ID}*`,
        },
      ],
    })

    const stmt = doc.Statement[0]!
    expect(stmt.Principal).toEqual({ AWS: tenantRoleArn })
    expect(stmt.Resource as string).toContain(TENANT_ID)
    expect(stmt.Resource as string).toContain(':domain/')
  })
})

// ── 5. Combined — complete tenant execution policy ────────────────────────────
// A realistic Lambda execution policy that combines silo, pool, and wildcard grants.

describe('combined — complete tenant execution policy', () => {
  it('produces correct statement count and structure', () => {
    const tenantConvention = org.with({ tenant: TENANT_ID })

    // Silo resources — dedicated per tenant
    const tenantTable = tenantConvention
      .with({ domain: 'oaspec', service: 'indexer' })
      .resource({ type: 'dynamoDb', key: 'specs' })
    const tenantGsi = tenantConvention
      .with({ domain: 'oaspec', service: 'indexer' })
      .resource({ type: 'dynamoDbGsi', key: 'specs' })
    const tenantParam = tenantConvention
      .with({ domain: 'oaspec', service: 'indexer' })
      .resource({ type: 'ssmParam', key: 'api-key' })

    // Pool resources — shared, scoped by tag condition
    const sharedDomain = oaspec.with({ service: 'oaspec' }).resource({ type: 'openSearchDomain' })
    const sharedBucket = oaspec.with({ service: 'storage' }).resource({ type: 's3Bucket' })

    const doc = org
      .policyBuilder()
      // Silo: table + GSI merge into one statement (same DynamoDB readWrite actions)
      .allow(tenantTable.write(), tenantGsi.write())
      // Silo: SSM read (different service → separate statement)
      .allow(tenantParam.read())
      // Pool: OpenSearch with tenant tag condition
      .allow(
        withCondition(
          sharedDomain.read(),
          tagCondition('aws:ResourceTag/slaops:tenant', TENANT_ID),
        ),
      )
      // Pool: S3 with prefix condition
      .allow(withCondition(sharedBucket.write(), s3PrefixCondition(TENANT_ID)))
      // Non-ARN: CloudWatch metrics
      .allow(rawGrant(['cloudwatch:PutMetricData'], '*'))
      .build()

    // Expected: table+GSI, SSM, OpenSearch, S3, CloudWatch = 5 statements
    expect(doc.Statement).toHaveLength(5)

    const effects = doc.Statement.map((s) => s.Effect)
    expect(effects.every((e) => e === 'Allow')).toBe(true)

    // table + GSI merged
    const dynamoStmt = doc.Statement[0]!
    expect(Array.isArray(dynamoStmt.Resource)).toBe(true)
    expect((dynamoStmt.Resource as string[]).some((r) => r.includes('/index/*'))).toBe(true)
    expect(dynamoStmt.Condition).toBeUndefined()

    // SSM
    const ssmStmt = doc.Statement[1]!
    expect(ssmStmt.Resource).toContain('parameter')

    // OpenSearch with condition
    const esStmt = doc.Statement[2]!
    expect(esStmt.Condition).toBeDefined()
    expect(esStmt.Condition!['StringEquals']!['aws:ResourceTag/slaops:tenant']).toBe(TENANT_ID)

    // S3 with prefix condition
    const s3Stmt = doc.Statement[3]!
    expect(s3Stmt.Condition!['StringLike']).toBeDefined()

    // CloudWatch wildcard
    const cwStmt = doc.Statement[4]!
    expect(cwStmt.Resource).toBe('*')
    expect(cwStmt.Action).toContain('cloudwatch:PutMetricData')
  })
})
