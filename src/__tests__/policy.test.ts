import { describe, it, expect } from '@jest/globals'
import { buildArn, buildPolicyArns } from '../policy/arn.js'
import { PolicyBuilder, rawGrant } from '../policy/PolicyBuilder.js'
import { DerropsConventions } from '../DerropsConventions.js'
import type { ArnContext } from '../policy/types.js'

const ctx: ArnContext = { accountId: '123456789012', region: 'ap-southeast-2', partition: 'aws' }

// ── buildArn ─────────────────────────────────────────────────────────────────

describe('buildArn', () => {
  it('constructs a full ARN with region and account', () => {
    expect(
      buildArn(
        'my-function',
        {
          service: 'lambda',
          includeRegion: true,
          includeAccount: true,
          resourcePrefix: 'function:',
        },
        ctx,
      ),
    ).toBe('arn:aws:lambda:ap-southeast-2:123456789012:function:my-function')
  })

  it('omits region for IAM (includeRegion: false)', () => {
    expect(
      buildArn(
        '/derrops/platform',
        { service: 'iam', includeRegion: false, includeAccount: true, resourcePrefix: 'role' },
        ctx,
      ),
    ).toBe('arn:aws:iam::123456789012:role/derrops/platform')
  })

  it('omits region and account for S3 (both false)', () => {
    expect(
      buildArn('my-bucket', { service: 's3', includeRegion: false, includeAccount: false }, ctx),
    ).toBe('arn:aws:s3:::my-bucket')
  })

  it('uses non-default partition', () => {
    expect(
      buildArn(
        'fn',
        {
          service: 'lambda',
          includeRegion: true,
          includeAccount: true,
          resourcePrefix: 'function:',
        },
        { ...ctx, partition: 'aws-cn' },
      ),
    ).toBe('arn:aws-cn:lambda:ap-southeast-2:123456789012:function:fn')
  })

  it('appends resourceSuffix', () => {
    expect(
      buildArn(
        'my-table',
        {
          service: 'dynamodb',
          includeRegion: true,
          includeAccount: true,
          resourcePrefix: 'table/',
          resourceSuffix: '/index/*',
        },
        ctx,
      ),
    ).toBe('arn:aws:dynamodb:ap-southeast-2:123456789012:table/my-table/index/*')
  })

  it('strips suffix from name before ARN construction', () => {
    expect(
      buildArn(
        'my-table--gsi',
        {
          service: 'dynamodb',
          includeRegion: true,
          includeAccount: true,
          resourcePrefix: 'table/',
          resourceSuffix: '/index/*',
          stripSuffix: '--gsi',
        },
        ctx,
      ),
    ).toBe('arn:aws:dynamodb:ap-southeast-2:123456789012:table/my-table/index/*')
  })

  it('does not strip when name does not end with stripSuffix', () => {
    expect(
      buildArn(
        'my-table-other',
        {
          service: 'dynamodb',
          includeRegion: true,
          includeAccount: true,
          resourcePrefix: 'table/',
          stripSuffix: '--gsi',
        },
        ctx,
      ),
    ).toBe('arn:aws:dynamodb:ap-southeast-2:123456789012:table/my-table-other')
  })
})

// ── buildPolicyArns ───────────────────────────────────────────────────────────

describe('buildPolicyArns', () => {
  it('returns single ARN when no policyResourceSuffix', () => {
    const arns = buildPolicyArns(
      'fn',
      { service: 'lambda', includeRegion: true, includeAccount: true, resourcePrefix: 'function:' },
      ctx,
    )
    expect(arns).toHaveLength(1)
    expect(arns[0]).toBe('arn:aws:lambda:ap-southeast-2:123456789012:function:fn')
  })

  it('returns two ARNs when policyResourceSuffix is set (S3)', () => {
    const arns = buildPolicyArns(
      'my-bucket',
      { service: 's3', includeRegion: false, includeAccount: false, policyResourceSuffix: '/*' },
      ctx,
    )
    expect(arns).toHaveLength(2)
    expect(arns[0]).toBe('arn:aws:s3:::my-bucket')
    expect(arns[1]).toBe('arn:aws:s3:::my-bucket/*')
  })

  it('returns two ARNs for openSearchDomain with policyResourceSuffix', () => {
    const arns = buildPolicyArns(
      'derrops--oaspec',
      {
        service: 'es',
        includeRegion: true,
        includeAccount: true,
        resourcePrefix: 'domain/',
        policyResourceSuffix: '/*',
      },
      ctx,
    )
    expect(arns[0]).toBe('arn:aws:es:ap-southeast-2:123456789012:domain/derrops--oaspec')
    expect(arns[1]).toBe('arn:aws:es:ap-southeast-2:123456789012:domain/derrops--oaspec/*')
  })
})

// ── StaticPolicyBuilder ───────────────────────────────────────────────────────

describe('StaticPolicyBuilder', () => {
  const c = new DerropsConventions({
    org: 'derrops',
    domain: 'platform',
    service: 'api',
    region: 'ap-southeast-2',
  }).arnContext({ accountId: '123456789012' })

  it('builds a basic policy document', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'read' })
      .buildPolicy()

    expect(doc.Version).toBe('2012-10-17')
    expect(doc.Statement).toHaveLength(1)
    expect(doc.Statement[0]!.Effect).toBe('Allow')
    expect(doc.Statement[0]!.Resource).toBe(
      'arn:aws:lambda:ap-southeast-2:123456789012:function:derrops--platform--api--handler',
    )
    expect(doc.Statement[0]!.Action).toContain('lambda:Get*')
  })

  it.skip('s3Bucket emits two ARNs (bucket + objects)', () => {
    const doc = c
      .staticPolicy()
      .include('s3Bucket', { key: 'data' }, { permissions: 'read' })
      .buildPolicy()

    const stmt = doc.Statement[0]!
    expect(Array.isArray(stmt.Resource)).toBe(true)
    const resources = stmt.Resource as string[]
    expect(resources).toHaveLength(2)
    expect(resources[0]).toMatch(/:::derrops--/)
    expect(resources[1]).toMatch(/\/\*$/)
  })

  it('openSearchDomain emits two ARNs (domain + domain/*)', () => {
    const doc = c
      .staticPolicy()
      .include('openSearchDomain', {}, { permissions: 'readWrite' })
      .buildPolicy()

    const resources = doc.Statement[0]!.Resource as string[]
    expect(resources).toHaveLength(2)
    expect(resources[0]).toContain(':domain/derrops--platform--api')
    expect(resources[1]).toBe(resources[0] + '/*')
  })

  it.skip('dynamoDbGsi ARN targets parent table, not the --gsi name', () => {
    const doc = c
      .staticPolicy()
      .include('dynamoDb', { key: 'orders' }, { permissions: 'readWrite' })
      .buildPolicy()
    const tableArn = doc.Statement[0]!.Resource as string
    expect(tableArn).toContain('table/derrops--platform--api--orders')

    const gsiDoc = c
      .staticPolicy()
      .include('dynamoDbGsi', { key: 'orders' }, { permissions: 'read' })
      .buildPolicy()
    const gsiResource = gsiDoc.Statement[0]!.Resource as string[]
    // should point to the table without --gsi, then /index/*
    expect(gsiResource[0]).toContain('table/derrops--platform--api--orders/index/*')
    expect(gsiResource[0]).not.toContain('--gsi')
  })


  it('deduplicates identical ARNs', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'read' })
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'read' })
      .buildPolicy()
    expect(doc.Statement).toHaveLength(1)
  })

  it('silently omits resources with no resolvable actions by default', () => {
    const doc = c.staticPolicy().include('lambdaFunction', { key: 'handler' }).buildPolicy()
    expect(doc.Statement).toHaveLength(0)
  })

  it('strict mode throws on unresolved actions', () => {
    expect(() =>
      c.staticPolicy().include('lambdaFunction', { key: 'handler' }).buildPolicy({ strict: true }),
    ).toThrow(/no resolvable actions/)
  })

  it('actionsFor fallback resolves actions', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' })
      .buildPolicy({ actionsFor: { lambdaFunction: ['lambda:InvokeFunction'] } })
    expect(doc.Statement[0]!.Action).toBe('lambda:InvokeFunction')
  })

  it('per-resource effect overrides global effect', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'manage', effect: 'Deny' })
      .include('s3Bucket', { key: 'data' }, { permissions: 'read' })
      .buildPolicy({ effect: 'Allow' })

    expect(doc.Statement[0]!.Effect).toBe('Deny')
    expect(doc.Statement[1]!.Effect).toBe('Allow')
  })

  it('additionalStatements are appended', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'read' })
      .buildPolicy({
        additionalStatements: [
          { Effect: 'Allow', Action: ['cloudwatch:PutMetricData'], Resource: '*' },
        ],
      })

    expect(doc.Statement).toHaveLength(2)
    expect(doc.Statement[1]!.Action).toContain('cloudwatch:PutMetricData')
  })

  it('global effect applies to all statements without per-resource effect', () => {
    const doc = c
      .staticPolicy()
      .include('lambdaFunction', { key: 'handler' }, { permissions: 'manage' })
      .buildPolicy({ effect: 'Deny' })
    expect(doc.Statement[0]!.Effect).toBe('Deny')
  })

  it('ssmDocument generates correct ARN', () => {
    const doc = c
      .staticPolicy()
      .include('ssmDocument', { key: 'deploy-script' }, { permissions: 'read' })
      .buildPolicy()
    expect(doc.Statement[0]!.Resource).toBe(
      'arn:aws:ssm:ap-southeast-2:123456789012:document/derrops--platform--api--deploy-script',
    )
  })

  it('configRule generates correct ARN', () => {
    const doc = c
      .staticPolicy()
      .include('configRule', { key: 'tagged' }, { permissions: 'read' })
      .buildPolicy()
    expect(doc.Statement[0]!.Resource).toBe(
      'arn:aws:config:ap-southeast-2:123456789012:config-rule/derrops--platform--api--tagged',
    )
  })

  it('redshiftCluster generates correct ARN', () => {
    const doc = c
      .staticPolicy()
      .include('redshiftCluster', {}, { permissions: 'read' })
      .buildPolicy()
    expect(doc.Statement[0]!.Resource).toContain('cluster:derrops--platform--api')
  })

  it('xraySamplingRule generates correct ARN', () => {
    const doc = c
      .staticPolicy()
      .include('xraySamplingRule', { key: 'low-rate' }, { permissions: 'readWrite' })
      .buildPolicy()
    expect(doc.Statement[0]!.Resource).toContain('sampling-rule/derrops--platform--api--low-rate')
  })

  it('mskCluster readWrite includes kafka-cluster data-plane actions', () => {
    const doc = c
      .staticPolicy()
      .include('mskCluster', {}, { permissions: 'readWrite' })
      .buildPolicy()
    const actions = doc.Statement[0]!.Action as string[]
    expect(actions).toContain('kafka-cluster:Connect')
    expect(actions).toContain('kafka-cluster:ReadData')
    expect(actions).toContain('kafka-cluster:WriteData')
  })

  it('apiGatewayRestApi has no ARN and throws on include', () => {
    expect(() =>
      c.staticPolicy().include('apiGatewayRestApi', {}, { permissions: 'read' }),
    ).toThrow(/no ARN configuration/)
  })
})

// ── DynamicPolicySession ──────────────────────────────────────────────────────

describe('DynamicPolicySession', () => {
  const c = new DerropsConventions({
    org: 'derrops',
    domain: 'platform',
    service: 'api',
    region: 'ap-southeast-2',
  }).arnContext({ accountId: '123456789012' })

  it('records names and builds policy', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'lambdaFunction', key: 'handler' }, { permissions: 'read' })
    session.name({ type: 'dynamoDb', key: 'orders' }, { permissions: 'readWrite' })

    const doc = session.buildPolicy()
    expect(doc.Statement).toHaveLength(2)
    expect(doc.Statement[0]!.Resource).toContain('function:derrops--platform--api--handler')
    expect(doc.Statement[1]!.Resource).toContain('table/derrops--platform--api--orders')
  })

  it('returns the generated name', () => {
    const session = c.dynamicPolicy()
    const name = session.name({ type: 'ssmParam', key: 'secret' })
    expect(name).toBe('/derrops/platform/api/secret')
  })

  it('skips resources with no ARN config', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'kafkaTopic', key: 'events' })
    const doc = session.buildPolicy()
    expect(doc.Statement).toHaveLength(0)
  })

  it('deduplicates identical ARNs', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'lambdaFunction', key: 'handler' }, { permissions: 'read' })
    session.name({ type: 'lambdaFunction', key: 'handler' }, { permissions: 'read' })
    expect(session.recordedResources()).toHaveLength(1)
  })

  it('recordedResources() includes no-ARN types with arn: null', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'kafkaTopic', key: 'events' })
    const recorded = session.recordedResources()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]!.arn).toBeNull()
  })

  it('honors default type from .with({ type })', () => {
    const scoped = c.with({ type: 'lambdaFunction' }).arnContext({ accountId: '123456789012' })
    const session = scoped.dynamicPolicy()
    const name = session.name({ key: 'worker' }, { permissions: 'read' })
    expect(name).toBe('derrops--platform--api--worker')
    const doc = session.buildPolicy()
    expect(doc.Statement[0]!.Resource).toContain('function:derrops--platform--api--worker')
  })

  it('additionalStatements are appended', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'lambdaFunction', key: 'handler' }, { permissions: 'read' })
    const doc = session.buildPolicy({
      additionalStatements: [
        { Effect: 'Allow', Action: ['cloudwatch:PutMetricData'], Resource: '*' },
      ],
    })
    expect(doc.Statement).toHaveLength(2)
  })

  it.skip('dynamoDbGsi ARN strips --gsi suffix', () => {
    const session = c.dynamicPolicy()
    session.name({ type: 'dynamoDbGsi', key: 'orders' }, { permissions: 'read' })
    const doc = session.buildPolicy()
    const resource = doc.Statement[0]!.Resource as string[]
    expect(resource[0]).toContain('table/derrops--platform--api--orders/index/*')
    expect(resource[0]).not.toContain('--gsi')
  })
})

// ── Resource ──────────────────────────────────────────────────────────────────

describe('DerropsConventions.resource()', () => {
  const c = new DerropsConventions({
    org: 'derrops',
    domain: 'platform',
    service: 'api',
    region: 'ap-southeast-2',
  }).arnContext({ accountId: '123456789012' })

  it('returns name, arn, arns, type, tags', () => {
    const r = c.resource({ type: 'lambdaFunction', key: 'handler' })
    expect(r.name).toBe('derrops--platform--api--handler')
    expect(r.arn).toBe(
      'arn:aws:lambda:ap-southeast-2:123456789012:function:derrops--platform--api--handler',
    )
    expect(r.arns).toHaveLength(1)
    expect(r.type).toBe('lambdaFunction')
    expect(r.tags).toBeDefined()
  })

  it('s3Bucket arns includes bucket and bucket/*', () => {
    const r = c.resource({ type: 's3Bucket', key: 'uploads' })
    expect(r.arns).toHaveLength(2)
    expect(r.arns[0]).toMatch(/:::ap-southeast-2--derrops--/)
    expect(r.arns[1]).toMatch(/\/\*$/)
  })

  it('throws when arnContext is not set', () => {
    const bare = new DerropsConventions({ org: 'derrops', region: 'ap-southeast-2' })
    expect(() => bare.resource({ type: 'lambdaFunction', key: 'h' })).toThrow(/accountId/)
  })

  it('honors default type via .with({ type })', () => {
    const scoped = c.with({ type: 'dynamoDb', key: 'orders' })
    const r = scoped.resource({})
    expect(r.type).toBe('dynamoDb')
    expect(r.name).toContain('orders')
  })

  describe('.read()', () => {
    it('returns read actions for the resource type', () => {
      const r = c.resource({ type: 'dynamoDb', key: 'orders' })
      const grant = r.read()
      expect(grant.actions).toContain('dynamodb:Get*')
      expect(grant.actions).toContain('dynamodb:Query')
      expect(grant.arns).toEqual(r.arns)
    })
  })

  describe('.write()', () => {
    it('returns readWrite actions for the resource type', () => {
      const r = c.resource({ type: 'dynamoDb', key: 'orders' })
      const grant = r.write()
      expect(grant.actions).toContain('dynamodb:Get*')
      expect(grant.actions).toContain('dynamodb:Put*')
    })
  })

  describe('.manage()', () => {
    it('returns manage actions', () => {
      const r = c.resource({ type: 'lambdaFunction', key: 'handler' })
      const grant = r.manage()
      expect(grant.actions).toContain('lambda:*')
    })
  })

  describe('.raw()', () => {
    it('returns explicit actions with resource arns', () => {
      const r = c.resource({ type: 'lambdaFunction', key: 'handler' })
      const grant = r.raw('lambda:InvokeFunction', 'lambda:GetFunction')
      expect(grant.actions).toEqual(['lambda:InvokeFunction', 'lambda:GetFunction'])
      expect(grant.arns).toEqual(r.arns)
    })

    it('throws when called with no actions', () => {
      const r = c.resource({ type: 'lambdaFunction', key: 'handler' })
      expect(() => r.raw()).toThrow(/.raw\(\) requires/)
    })
  })
})

// ── PolicyBuilder ─────────────────────────────────────────────────────────────

describe('PolicyBuilder', () => {
  const c = new DerropsConventions({
    org: 'derrops',
    domain: 'platform',
    service: 'api',
    region: 'ap-southeast-2',
  }).arnContext({ accountId: '123456789012' })

  it('merges two resources with identical action sets into one statement', () => {
    const table1 = c.resource({ type: 'dynamoDb', key: 'orders' })
    const table2 = c.resource({ type: 'dynamoDb', key: 'sessions' })

    const doc = new PolicyBuilder().allow(table1.read(), table2.read()).build()

    expect(doc.Statement).toHaveLength(1)
    expect(doc.Statement[0]!.Effect).toBe('Allow')
    const resources = doc.Statement[0]!.Resource as string[]
    expect(resources).toHaveLength(2)
    expect(resources[0]).toContain('table/derrops--platform--api--orders')
    expect(resources[1]).toContain('table/derrops--platform--api--sessions')
  })

  it('does not merge resources with different action sets', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const fn = c.resource({ type: 'lambdaFunction', key: 'handler' })

    const doc = new PolicyBuilder().allow(table.read(), fn.read()).build()

    expect(doc.Statement).toHaveLength(2)
  })

  it('does not merge Allow and Deny even with the same actions', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })

    const doc = new PolicyBuilder().allow(table.manage()).deny(table.manage()).build()

    expect(doc.Statement).toHaveLength(2)
    expect(doc.Statement[0]!.Effect).toBe('Allow')
    expect(doc.Statement[1]!.Effect).toBe('Deny')
  })

  it('merges s3Bucket write() — one statement with bucket + bucket/* as resources', () => {
    const bucket = c.resource({ type: 's3Bucket', key: 'uploads' })

    const doc = new PolicyBuilder().allow(bucket.write()).build()

    expect(doc.Statement).toHaveLength(1)
    const resources = doc.Statement[0]!.Resource as string[]
    expect(resources).toHaveLength(2)
    expect(resources[1]).toMatch(/\/\*$/)
  })

  it('dynamoDb table and GSI with write() merge into one statement', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const gsi = c.resource({ type: 'dynamoDbGsi', key: 'orders' })

    const doc = new PolicyBuilder().allow(table.write(), gsi.write()).build()

    // Both dynamoDb and dynamoDbGsi share the same readWrite action list
    expect(doc.Statement).toHaveLength(1)
    const resources = doc.Statement[0]!.Resource as string[]
    // table ARN
    expect(resources.some((r) => r.endsWith('table/derrops--platform--api--orders'))).toBe(true)
    // GSI ARN — strips --gsi suffix, appends /index/*
    expect(resources.some((r) => r.includes('/index/*') && !r.includes('--gsi'))).toBe(true)
  })

  it('raw() grants merge when action lists are identical', () => {
    const fn1 = c.resource({ type: 'lambdaFunction', key: 'handler' })
    const fn2 = c.resource({ type: 'lambdaFunction', key: 'worker' })

    const doc = new PolicyBuilder()
      .allow(fn1.raw('lambda:InvokeFunction'), fn2.raw('lambda:InvokeFunction'))
      .build()

    expect(doc.Statement).toHaveLength(1)
    const resources = doc.Statement[0]!.Resource as string[]
    expect(resources).toHaveLength(2)
  })

  it('rawGrant with * resource produces correct statement', () => {
    const doc = new PolicyBuilder()
      .allow(rawGrant(['cloudwatch:PutMetricData', 'cloudwatch:PutMetricAlarm'], '*'))
      .build()

    expect(doc.Statement).toHaveLength(1)
    expect(doc.Statement[0]!.Resource).toBe('*')
    const actions = doc.Statement[0]!.Action as string[]
    expect(actions).toContain('cloudwatch:PutMetricData')
  })

  it('additionalStatements are appended at the end', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const doc = new PolicyBuilder()
      .allow(table.read())
      .build({ additionalStatements: [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }] })

    expect(doc.Statement).toHaveLength(2)
    expect(doc.Statement[1]!.Action).toBe('s3:*')
  })

  it('produces a single-string Action when there is only one action', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const doc = new PolicyBuilder().allow(table.raw('dynamodb:GetItem')).build()
    expect(typeof doc.Statement[0]!.Action).toBe('string')
  })

  it('deduplicates identical ARNs within one allow() call', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const doc = new PolicyBuilder().allow(table.read(), table.read()).build()

    expect(doc.Statement).toHaveLength(1)
    const resource = doc.Statement[0]!.Resource
    // Single ARN string, not duplicated array
    expect(typeof resource).toBe('string')
  })

  it('preserves insertion order of statement groups', () => {
    const fn = c.resource({ type: 'lambdaFunction', key: 'handler' })
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })

    const doc = new PolicyBuilder().allow(fn.read()).allow(table.read()).build()

    expect((doc.Statement[0]!.Resource as string).includes('function')).toBe(true)
    expect((doc.Statement[1]!.Resource as string).includes('table')).toBe(true)
  })

  it('c.policyBuilder() is a convenience alias for new PolicyBuilder()', () => {
    const table = c.resource({ type: 'dynamoDb', key: 'orders' })
    const doc = c.policyBuilder().allow(table.read()).build()
    expect(doc.Version).toBe('2012-10-17')
  })
})
