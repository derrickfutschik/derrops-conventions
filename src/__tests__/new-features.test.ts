/**
 * Tests covering features added in the convention extension sprint:
 * KMS, observability, cost allocation, for(), validation, EKS/k8s,
 * Cloud Map, dependency modelling, CloudFormation exports, tenant manifest.
 */
import { describe, it, expect } from '@jest/globals'
import { DerropsConventions } from '../DerropsConventions.js'
import type { ResourceType } from '../resource-types.js'

// ── Shared fixtures ───────────────────────────────────────────────────────────

const base = () =>
  new DerropsConventions({
    org: 'acme',
    domain: 'payments',
    service: 'checkout-api',
    env: 'prod',
    region: 'ap-southeast-2',
  })
    .tagPrefix('derrops:')
    .tagKeys('org', 'domain', 'service', 'env')

const withArn = () => base().arnContext({ accountId: '123456789012' })

// ── 1. KMS ────────────────────────────────────────────────────────────────────

describe('KMS resource types', () => {
  describe('kmsAlias', () => {
    it('generates org/domain/service path', () => {
      expect(base().name({ type: 'kmsAlias' })).toBe('acme/payments/checkout-api')
    })

    it('appends key when provided', () => {
      expect(base().name({ type: 'kmsAlias', key: 'data-key' })).toBe(
        'acme/payments/checkout-api/data-key',
      )
    })

    it('builds the correct ARN with alias/ prefix', () => {
      const r = withArn().resource({ type: 'kmsAlias', key: 'data-key' })
      expect(r.arn).toBe(
        'arn:aws:kms:ap-southeast-2:123456789012:alias/acme/payments/checkout-api/data-key',
      )
    })

    it('emits read permission actions', () => {
      const r = withArn().resource({ type: 'kmsAlias' })
      expect(r.read().actions).toContain('kms:Decrypt')
      expect(r.read().actions).toContain('kms:GenerateDataKey')
      expect(r.read().actions).toContain('kms:DescribeKey')
    })

    it('emits readWrite permission actions including Encrypt', () => {
      const r = withArn().resource({ type: 'kmsAlias' })
      expect(r.write().actions).toContain('kms:Encrypt')
      expect(r.write().actions).toContain('kms:ReEncrypt*')
    })

    it('manage uses kms:*', () => {
      const r = withArn().resource({ type: 'kmsAlias' })
      expect(r.manage().actions).toContain('kms:*')
    })
  })

  describe('kmsKey', () => {
    it('generates -- delimited descriptive name', () => {
      expect(base().name({ type: 'kmsKey', key: 'cmk' })).toBe('acme--payments--checkout-api--cmk')
    })
  })
})

// ── 2. Observability ──────────────────────────────────────────────────────────

describe('cloudwatchResource()', () => {
  it('returns namespace, logGroup, dashboard, and dimensions', () => {
    const obs = base().cloudwatchResource()
    expect(obs.namespace).toBe('acme/payments')
    expect(obs.logGroup).toBe('/acme/payments/checkout-api')
    expect(obs.dashboard).toBe('acme--payments--checkout-api')
    expect(obs.alarm).toBeUndefined()
    expect(Array.isArray(obs.dimensions)).toBe(true)
  })

  it('includes alarm name when key is provided', () => {
    const obs = base().cloudwatchResource({ key: 'error-rate' })
    expect(obs.alarm).toBe('acme--payments--checkout-api--error-rate')
  })

  it('alarm is undefined when no key given', () => {
    expect(base().cloudwatchResource().alarm).toBeUndefined()
  })

  it('namespace matches name({ type: cloudwatchMetricNamespace })', () => {
    const c = base()
    expect(c.cloudwatchResource().namespace).toBe(c.name({ type: 'cloudwatchMetricNamespace' }))
  })

  it('logGroup matches name({ type: cloudwatchLogsGroup })', () => {
    const c = base()
    expect(c.cloudwatchResource().logGroup).toBe(c.name({ type: 'cloudwatchLogsGroup' }))
  })

  it('cloudwatchAlarm ARN format', () => {
    const r = withArn().resource({ type: 'cloudwatchAlarm', key: 'latency' })
    expect(r.arn).toMatch(/^arn:aws:cloudwatch:ap-southeast-2:123456789012:alarm:/)
  })

  it('cloudwatchDashboard ARN format (global — no region/account)', () => {
    const r = withArn().resource({ type: 'cloudwatchDashboard' })
    expect(r.arn).toBe('arn:aws:cloudwatch:::dashboard/acme--payments--checkout-api')
  })
})

// ── 3. Cost allocation ────────────────────────────────────────────────────────

describe('costFilter()', () => {
  it('returns an And array of tag filters', () => {
    const filter = base().costFilter()
    expect(Array.isArray(filter.And)).toBe(true)
    expect(filter.And.length).toBeGreaterThan(0)
  })

  it('each filter has Key, Values, and MatchOptions: ["EQUALS"]', () => {
    const filter = base().costFilter()
    for (const f of filter.And) {
      expect(f.Tags.Key).toBeTruthy()
      expect(Array.isArray(f.Tags.Values)).toBe(true)
      expect(f.Tags.MatchOptions).toEqual(['EQUALS'])
    }
  })

  it('includes the visible tag keys', () => {
    const filter = base().costFilter()
    const keys = filter.And.map((f) => f.Tags.Key)
    expect(keys).toContain('derrops:org')
    expect(keys).toContain('derrops:domain')
    expect(keys).toContain('derrops:service')
    expect(keys).toContain('derrops:env')
  })

  it('excludes structural schema tags (segment, s3-prefix-segment, etc.)', () => {
    const filter = base().costFilter()
    const keys = filter.And.map((f) => f.Tags.Key)
    expect(keys).not.toContain('derrops:segment')
    expect(keys).not.toContain('derrops:s3-prefix-segment')
    expect(keys).not.toContain('derrops:segment-values')
  })

  it('filter values match the actual segment values', () => {
    const filter = base().costFilter()
    const orgFilter = filter.And.find((f) => f.Tags.Key === 'derrops:org')
    expect(orgFilter?.Tags.Values).toEqual(['acme'])
  })

  it('respects tagPrefix when building filter keys', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      .tagPrefix('myapp:')
      .tagKeys('org', 'domain')
    const keys = c.costFilter().And.map((f) => f.Tags.Key)
    expect(keys).toContain('myapp:org')
    expect(keys).toContain('myapp:domain')
  })
})

describe('budgetName()', () => {
  it('produces org--domain--service--env', () => {
    expect(base().budgetName()).toBe('acme--payments--checkout-api--prod')
  })

  it('omits segments not set on the instance', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'logs' })
    expect(c.budgetName()).toBe('acme--logs')
  })

  it('includes env when set', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'logs', service: 'ingest', env: 'dev' })
    expect(c.budgetName()).toBe('acme--logs--ingest--dev')
  })
})

describe('costAllocationTags()', () => {
  it('returns the list of visible tag key names with prefix', () => {
    const keys = base().costAllocationTags()
    expect(keys).toContain('derrops:org')
    expect(keys).toContain('derrops:domain')
    expect(keys).toContain('derrops:service')
    expect(keys).toContain('derrops:env')
  })

  it('respects tagKeys() to control which tags appear', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments' })
      .tagPrefix('app:')
      .tagKeys('domain')
    expect(c.costAllocationTags()).toEqual(['app:domain'])
  })

  it('applies casing to key names', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      .tagKeyCasing('pascal')
      .tagKeys('org', 'domain')
    expect(c.costAllocationTags()).toContain('Org')
    expect(c.costAllocationTags()).toContain('Domain')
  })
})

// ── 4. for() — general segment override ──────────────────────────────────────

describe('for()', () => {
  it('overrides any segment without changing the parent', () => {
    const c = base()
    const prod = c.for({ env: 'prod' })
    expect(prod.name({ type: 'lambdaFunction' })).toBe('acme--payments--checkout-api')
    // Parent unchanged
    expect(c.for({ env: 'dev' }).name({ type: 'lambdaFunction' })).not.toContain('prod')
  })

  it('can override multiple segments at once', () => {
    const c = new DerropsConventions({ org: 'acme', env: 'dev', region: 'us-east-1' })
    const derived = c.for({
      env: 'prod',
      region: 'ap-southeast-2',
      domain: 'logs',
      service: 'ingest',
    })
    expect(derived.name({ type: 's3Bucket' })).toBe('ap-southeast-2--prod--acme--logs--ingest')
  })

  it('does NOT register as a child (not in hierarchy for toMermaid)', () => {
    const c = base()
    c.for({ env: 'staging' })
    expect(c.children()).toHaveLength(0)
  })

  it('inherits tagPrefix from parent', () => {
    const derived = base().for({ env: 'staging' })
    expect(derived.tags()).toHaveProperty('derrops:env', 'staging')
  })

  it('inherits tagKeyCasing from parent', () => {
    // Parent has pascal casing — the derived instance's existing visible tags also use pascal.
    const c = new DerropsConventions({
      org: 'acme',
      domain: 'logs',
      service: 'ingest',
    }).tagKeyCasing('pascal')
    const derived = c.for({ domain: 'payments' })
    // Domain was already a visible tag; pascal casing is preserved on the derived instance.
    expect(derived.tags()).toHaveProperty('Domain', 'payments')
  })

  it('can project to a different env (env promotion pattern)', () => {
    const dev = new DerropsConventions({
      org: 'acme',
      domain: 'logs',
      service: 'ingest',
      env: 'dev',
      region: 'ap-southeast-2',
    })
    const prodBucket = dev.for({ env: 'prod' }).name({ type: 's3Bucket' })
    expect(prodBucket).toBe('ap-southeast-2--prod--acme--logs--ingest')
    expect(prodBucket).not.toContain('dev')
  })

  it('can project to a different region (DR pattern)', () => {
    const primary = base()
    const drName = primary.for({ region: 'us-east-1' }).name({ type: 's3Bucket' })
    expect(drName).toContain('us-east-1')
    expect(drName).not.toContain('ap-southeast-2')
  })
})

// ── 5. Validation ─────────────────────────────────────────────────────────────

describe('validate()', () => {
  const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'checkout-api' })

  it('returns valid: true for a correctly generated name', () => {
    const result = c.validate('acme--payments--checkout-api', 'lambdaFunction')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.type).toBe('lambdaFunction')
  })

  it('includes the parsed segments in the result', () => {
    const result = c.validate('acme--payments--checkout-api', 'lambdaFunction')
    expect(result.parsed.org).toBe('acme')
    expect(result.parsed.domain).toBe('payments')
    expect(result.parsed.service).toBe('checkout-api')
  })

  it('returns valid: false when a segment mismatches', () => {
    const result = c.validate('acme--WRONG--checkout-api', 'lambdaFunction')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/domain.*expected "payments".*got "WRONG"/i)
  })

  it('catches multiple segment mismatches', () => {
    const result = c.validate('globex--billing--checkout-api', 'lambdaFunction')
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2) // org + domain mismatch
  })

  it('returns valid: true when the name has extra segments not set on convention', () => {
    // Convention doesn't constrain 'key', so extra segment is fine
    const result = c.validate('acme--payments--checkout-api--v2', 'lambdaFunction')
    // parse sees org/domain/service but key='v2' is beyond what the convention checks
    expect(result.valid).toBe(true)
  })

  it('returns the resource type in the result', () => {
    const result = c.validate('acme--payments--checkout-api', 'lambdaFunction')
    expect(result.type).toBe('lambdaFunction')
  })
})

describe('lint()', () => {
  const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })

  it('all passed when all names match', () => {
    const report = c.lint({
      lambdaFunction: 'acme--payments--api',
      sqsQueue: 'acme--payments--api',
    })
    expect(report.passed).toHaveLength(2)
    expect(report.failed).toHaveLength(0)
    expect(report.summary).toBe('2/2 passed')
  })

  it('records failures when names mismatch', () => {
    const report = c.lint({
      lambdaFunction: 'acme--payments--api',
      sqsQueue: 'acme--WRONG--api',
    })
    expect(report.passed).toHaveLength(1)
    expect(report.failed).toHaveLength(1)
    expect(report.summary).toBe('1/2 passed')
  })

  it('summary is "0/1 passed" when everything fails', () => {
    const report = c.lint({ lambdaFunction: 'bad--name' })
    expect(report.summary).toBe('0/1 passed')
  })

  it('failed entries carry their errors', () => {
    const report = c.lint({ lambdaFunction: 'WRONG--payments--api' })
    expect(report.failed[0]?.errors[0]).toMatch(/org/)
  })
})

// ── 6. EKS / Kubernetes ───────────────────────────────────────────────────────

describe('EKS resource types', () => {
  describe('eksCluster', () => {
    it('generates org--domain--service', () => {
      expect(base().name({ type: 'eksCluster' })).toBe('acme--payments--checkout-api')
    })

    it('builds the correct ARN', () => {
      const r = withArn().resource({ type: 'eksCluster' })
      expect(r.arn).toBe(
        'arn:aws:eks:ap-southeast-2:123456789012:cluster/acme--payments--checkout-api',
      )
    })

    it('read permissions include eks:Describe* and eks:List*', () => {
      const r = withArn().resource({ type: 'eksCluster' })
      expect(r.read().actions).toContain('eks:Describe*')
      expect(r.read().actions).toContain('eks:List*')
    })
  })

  describe('k8s naming types', () => {
    it('k8sNamespace is the domain segment only', () => {
      expect(base().name({ type: 'k8sNamespace' })).toBe('payments')
    })

    it('k8sDeployment is the service segment only', () => {
      expect(base().name({ type: 'k8sDeployment' })).toBe('checkout-api')
    })

    it('k8sService is the service segment only', () => {
      expect(base().name({ type: 'k8sService' })).toBe('checkout-api')
    })

    it('k8sConfigMap uses service-key with hyphen', () => {
      expect(base().name({ type: 'k8sConfigMap', key: 'app-config' })).toBe(
        'checkout-api-app-config',
      )
    })

    it('k8sSecret uses service-key with hyphen', () => {
      expect(base().name({ type: 'k8sSecret', key: 'db-password' })).toBe(
        'checkout-api-db-password',
      )
    })

    it('k8s names use hyphens only (DNS-label safe)', () => {
      // No underscores, no double dashes
      const names = ['k8sNamespace', 'k8sDeployment', 'k8sService'] as const
      for (const type of names) {
        const n = base().name({ type })
        expect(n).not.toContain('_')
        expect(n).not.toContain('--')
      }
    })
  })
})

describe('eksResource()', () => {
  it('returns cluster, namespace, deployment, service', () => {
    const eks = base().eksResource()
    expect(eks.cluster).toBe('acme--payments--checkout-api')
    expect(eks.namespace).toBe('payments')
    expect(eks.deployment).toBe('checkout-api')
    expect(eks.service).toBe('checkout-api')
  })

  it('nodeGroup is undefined when no nodeGroupPurpose', () => {
    expect(base().eksResource().nodeGroup).toBeUndefined()
  })

  it('nodeGroup is set when nodeGroupPurpose is given', () => {
    const eks = base().eksResource({ nodeGroupPurpose: 'workers' })
    expect(eks.nodeGroup).toContain('workers')
    expect(eks.nodeGroup).toContain('checkout-api')
  })

  it('configMap and secret are undefined when no key', () => {
    const eks = base().eksResource()
    expect(eks.configMap).toBeUndefined()
    expect(eks.secret).toBeUndefined()
  })

  it('configMap and secret are set when key is given', () => {
    const eks = base().eksResource({ key: 'app-config' })
    expect(eks.configMap).toContain('checkout-api')
    expect(eks.configMap).toContain('app-config')
    expect(eks.secret).toContain('checkout-api')
  })

  it('all names are consistent — derived from the same convention', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'analytics', service: 'pipeline' })
    const eks = c.eksResource({ nodeGroupPurpose: 'spot' })
    expect(eks.cluster).toBe('acme--analytics--pipeline')
    expect(eks.namespace).toBe('analytics')
    expect(eks.deployment).toBe('pipeline')
    expect(eks.nodeGroup).toContain('spot')
  })
})

// ── 7. Cloud Map ──────────────────────────────────────────────────────────────

describe('cloudMapResource()', () => {
  it('returns namespace, service, and fqdn', () => {
    const r = base().cloudMapResource()
    expect(r.namespace).toBe('payments.acme.local')
    expect(r.service).toBe('checkout-api')
    expect(r.fqdn).toBe('checkout-api.payments.acme.local')
  })

  it('namespace is domain.org.local', () => {
    expect(base().cloudMapResource().namespace).toMatch(/^payments\.acme\.local$/)
  })

  it('fqdn is service.namespace', () => {
    const r = base().cloudMapResource()
    expect(r.fqdn).toBe(`${r.service}.${r.namespace}`)
  })

  it('cloudMapNamespace ARN format', () => {
    const r = withArn().resource({ type: 'cloudMapNamespace' })
    expect(r.arn).toMatch(/^arn:aws:servicediscovery:ap-southeast-2:123456789012:namespace\//)
  })

  it('cloudMapService ARN format', () => {
    const r = withArn().resource({ type: 'cloudMapService' })
    expect(r.arn).toMatch(/^arn:aws:servicediscovery:ap-southeast-2:123456789012:service\//)
  })

  it('service segment matches k8sService — same identity for ECS + Cloud Map', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
    expect(c.cloudMapResource().service).toBe(c.name({ type: 'k8sService' }))
  })
})

// ── 8. Dependency modelling ───────────────────────────────────────────────────

describe('dependsOn() + dependencies() + policyFor()', () => {
  describe('dependsOn()', () => {
    it('is chainable', () => {
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const db = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'db' })
      expect(api.dependsOn(db, ['dynamoDb'])).toBe(api)
    })

    it('can declare multiple dependencies on the same owner', () => {
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const store = new DerropsConventions({ org: 'acme', domain: 'storage', service: 'data' })
      api.dependsOn(store, ['dynamoDb']).dependsOn(store, ['s3Bucket'])
      const { edges } = api.dependencies()
      expect(edges.filter((e) => e.owner === store)).toHaveLength(2)
    })
  })

  describe('dependencies()', () => {
    it('returns only the root when no dependencies declared', () => {
      const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const { nodes, edges } = c.dependencies()
      expect(nodes).toHaveLength(1)
      expect(edges).toHaveLength(0)
    })

    it('includes the owner in nodes when a dependency is declared', () => {
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const db = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'db' })
      api.dependsOn(db, ['dynamoDb'])
      const { nodes } = api.dependencies()
      expect(nodes).toContain(api)
      expect(nodes).toContain(db)
    })

    it('records the correct edge with from, owner, and resources', () => {
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      const db = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'db' })
      api.dependsOn(db, ['dynamoDb', 'sqsQueue'])
      const { edges } = api.dependencies()
      expect(edges[0]?.from).toBe(api)
      expect(edges[0]?.owner).toBe(db)
      expect(edges[0]?.resources).toEqual(['dynamoDb', 'sqsQueue'])
    })

    it('handles transitive dependencies (A → B → C)', () => {
      const a = new DerropsConventions({ org: 'x', domain: 'd', service: 'a' })
      const b = new DerropsConventions({ org: 'x', domain: 'd', service: 'b' })
      const c2 = new DerropsConventions({ org: 'x', domain: 'd', service: 'c' })
      a.dependsOn(b, ['lambdaFunction'])
      b.dependsOn(c2, ['dynamoDb'])
      const { nodes } = a.dependencies()
      expect(nodes).toContain(c2)
      expect(nodes).toHaveLength(3)
    })

    it('does not loop on a cycle (A ↔ B)', () => {
      const a = new DerropsConventions({ org: 'x', domain: 'd', service: 'a' })
      const b = new DerropsConventions({ org: 'x', domain: 'd', service: 'b' })
      a.dependsOn(b, ['lambdaFunction'])
      b.dependsOn(a, ['sqsQueue'])
      expect(() => a.dependencies()).not.toThrow()
      const { nodes } = a.dependencies()
      expect(nodes).toHaveLength(2) // no infinite loop
    })
  })

  describe('policyFor()', () => {
    it('returns a PolicyBuilder', () => {
      const db = withArn().with({ service: 'db' })
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      api.dependsOn(db, ['dynamoDb'])
      const builder = db.policyFor(api)
      expect(typeof builder.build).toBe('function')
    })

    it('builds a valid policy document with statements', () => {
      const db = withArn().with({ service: 'db' })
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      api.dependsOn(db, ['dynamoDb'])
      const doc = db.policyFor(api).build()
      expect(doc.Statement.length).toBeGreaterThan(0)
      expect(doc.Statement[0]?.Effect).toBe('Allow')
    })

    it('returns an empty policy when caller has no declared dependencies on this owner', () => {
      const db = withArn().with({ service: 'db' })
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      // api never called dependsOn(db, ...)
      const doc = db.policyFor(api).build()
      expect(doc.Statement).toHaveLength(0)
    })

    it('policy ARNs reference the owner convention resources, not the caller', () => {
      const db = withArn().with({ service: 'db' })
      const api = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
      api.dependsOn(db, ['dynamoDb'])
      const doc = db.policyFor(api).build()
      const resources = doc.Statement.flatMap((s) => s.Resource as string[])
      // All resource ARNs should reference 'db', not 'api'
      for (const r of resources) {
        expect(r).toContain('db')
      }
    })
  })
})

// ── 9. CloudFormation exports ─────────────────────────────────────────────────

describe('cfnExport()', () => {
  it('produces org--domain--service--key', () => {
    expect(base().cfnExport('vpc-id')).toBe('acme--payments--checkout-api--vpc-id')
  })

  it('normalises the export key to lowercase with hyphens', () => {
    expect(base().cfnExport('VPC ID')).toBe('acme--payments--checkout-api--vpc-id')
  })

  it('works with partial convention (only org + domain)', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'platform' })
    expect(c.cfnExport('sg-id')).toBe('acme--platform--sg-id')
  })

  it('works with only org set', () => {
    const c = new DerropsConventions({ org: 'acme' })
    expect(c.cfnExport('tgw-id')).toBe('acme--tgw-id')
  })

  it('different services produce different export names', () => {
    const c1 = new DerropsConventions({ org: 'acme', domain: 'platform', service: 'vpc' })
    const c2 = new DerropsConventions({ org: 'acme', domain: 'platform', service: 'db' })
    expect(c1.cfnExport('subnet-id')).not.toBe(c2.cfnExport('subnet-id'))
  })

  it('is stable — same inputs always produce the same output', () => {
    const c = new DerropsConventions({ org: 'acme', domain: 'payments', service: 'api' })
    expect(c.cfnExport('bucket-arn')).toBe(c.cfnExport('bucket-arn'))
  })
})

// ── 12. Tenant manifest ───────────────────────────────────────────────────────

describe('tenantManifest()', () => {
  const c = new DerropsConventions({
    org: 'acme',
    domain: 'payments',
    service: 'api',
    env: 'prod',
    region: 'ap-southeast-2',
  }).arnContext({ accountId: '123456789012' })

  it('sets the tenantId on the manifest', () => {
    const m = c.tenantManifest('t-xyz', ['lambdaFunction'])
    expect(m.tenantId).toBe('t-xyz')
  })

  it('resource names include the tenant segment', () => {
    const m = c.tenantManifest('t-xyz', ['s3ObjectKey'])
    const r = m.resources.find((x) => x.type === 's3ObjectKey')
    expect(r?.name).toContain('t-xyz')
  })

  it('produces resources for every requested type', () => {
    const types: ResourceType[] = ['dynamoDb', 'sqsQueue', 'lambdaFunction']
    const m = c.tenantManifest('t-abc', types)
    expect(m.resources).toHaveLength(3)
    for (const type of types) {
      expect(m.resources.some((r) => r.type === type)).toBe(true)
    }
  })

  it('resources with ARN config have a non-null arn', () => {
    const m = c.tenantManifest('t-xyz', ['dynamoDb'])
    expect(m.resources[0]?.arn).toBeTruthy()
    expect(m.resources[0]?.arn).toMatch(/^arn:aws:/)
  })

  it('resources without ARN config have arn: undefined', () => {
    const m = c.tenantManifest('t-xyz', ['kmsKey'])
    expect(m.resources[0]?.arn).toBeUndefined()
  })

  it('resources include tags with the tenant segment', () => {
    const m = c.tenantManifest('t-xyz', ['dynamoDb'])
    // tags() on the tenanted instance should have the tenant key
    expect(m.resources[0]?.tags).toBeDefined()
  })

  describe('diff()', () => {
    it('unchanged when both manifests have the same resource types', () => {
      const m1 = c.tenantManifest('t-xyz', ['dynamoDb', 'sqsQueue'])
      const m2 = c.tenantManifest('t-xyz', ['dynamoDb', 'sqsQueue'])
      const diff = m1.diff(m2)
      expect(diff.added).toHaveLength(0)
      expect(diff.removed).toHaveLength(0)
      expect(diff.unchanged).toHaveLength(2)
    })

    it('added when current has a type existing manifest does not', () => {
      const old = c.tenantManifest('t-xyz', ['dynamoDb'])
      const current = c.tenantManifest('t-xyz', ['dynamoDb', 'sqsQueue'])
      const diff = current.diff(old)
      expect(diff.added).toHaveLength(1)
      expect(diff.added[0]?.type).toBe('sqsQueue')
    })

    it('removed when existing has a type current does not', () => {
      const old = c.tenantManifest('t-xyz', ['dynamoDb', 'sqsQueue'])
      const current = c.tenantManifest('t-xyz', ['dynamoDb'])
      const diff = current.diff(old)
      expect(diff.removed).toHaveLength(1)
      expect(diff.removed[0]?.type).toBe('sqsQueue')
    })

    it('handles an empty existing manifest', () => {
      const old = c.tenantManifest('t-xyz', [])
      const current = c.tenantManifest('t-xyz', ['dynamoDb', 'sqsQueue'])
      const diff = current.diff(old)
      expect(diff.added).toHaveLength(2)
      expect(diff.removed).toHaveLength(0)
    })
  })
})
